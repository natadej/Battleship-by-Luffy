import { type AIState, type Level, aiMode } from './ai'
import { type Board, type Coord, type Orientation, type Ship, SIZE, inBounds, isSunk, sameCoord, shipAt, shipCells } from './board'

export type Weapon = 'missile' | 'nuke' | 'mg' | 'b52'
export type Special = Exclude<Weapon, 'missile'>
export type Arsenal = Record<Special, number>

export const WEAPON_ORDER: Weapon[] = ['missile', 'nuke', 'mg', 'b52']
export const WEAPON_INFO: Record<Weapon, { name: string; effect: string }> = {
  missile: { name: 'Missile', effect: '1 square' },
  nuke: { name: 'Nuke', effect: 'All 9 squares around the target' },
  mg: { name: 'Machine gun', effect: '3 squares in a row through the target, across or down' },
  b52: { name: 'B-52', effect: 'The target and 2 random squares next to it' },
}

/** Specials each side gets per level; missiles are unlimited. */
export const fullArsenal = (): Arsenal => ({ nuke: 1, mg: 1, b52: 1 })

const isOpen = (board: Board, p: Coord) => inBounds(p) && board.shots[p.r][p.c] === null

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Squares a weapon fired at `target` hits: the target first, then the extra squares not yet shot. */
export function footprint(weapon: Weapon, target: Coord, board: Board, rng: () => number = Math.random): Coord[] {
  const around: Coord[] = []
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) around.push({ r: target.r + dr, c: target.c + dc })
  const extra = (() => {
    switch (weapon) {
      case 'missile':
        return []
      case 'nuke':
        return around
      case 'mg':
        return rng() < 0.5
          ? [{ r: target.r, c: target.c - 1 }, { r: target.r, c: target.c + 1 }]
          : [{ r: target.r - 1, c: target.c }, { r: target.r + 1, c: target.c }]
      case 'b52':
        return shuffle(around.filter((p) => isOpen(board, p)), rng).slice(0, 2)
    }
  })()
  return [target, ...extra.filter((p) => isOpen(board, p))]
}

/** The AI's weapon for its next shot: machine gun to finish a ship it has found, nuke or B-52 while hunting. */
export function aiWeapon(ai: AIState, arsenal: Arsenal, level: Level, rng: () => number = Math.random): Weapon {
  const left = (Object.keys(arsenal) as Special[]).filter((w) => arsenal[w] > 0)
  if (!left.length) return 'missile'
  if (level === 1) return rng() < 0.15 ? left[Math.floor(rng() * left.length)] : 'missile'
  const hunting = aiMode(ai) === 'hunt'
  if (!hunting && arsenal.mg > 0 && rng() < 0.4) return 'mg'
  if (hunting && arsenal.nuke > 0 && rng() < 0.12) return 'nuke'
  if (hunting && arsenal.b52 > 0 && rng() < 0.15) return 'b52'
  return 'missile'
}

/** A random water square with no ship, for the healing box. */
export function crateSpot(board: Board, rng: () => number = Math.random): Coord {
  for (;;) {
    const p = { r: Math.floor(rng() * SIZE), c: Math.floor(rng() * SIZE) }
    if (!shipAt(board, p) && board.shots[p.r][p.c] === null) return p
  }
}

/** A ship the healing kit can repair: hit at least once but still afloat. */
export const canHeal = (board: Board, ship: Ship) => !isSunk(board, ship) && ship.cells.some((p) => board.shots[p.r][p.c] === 'hit')

/** Squares `ship` would take at `start`, or null unless every one is unshot water clear of the other ships. */
export function relocation(board: Board, ship: Ship, start: Coord, orientation: Orientation): Coord[] | null {
  const cells = shipCells(start, ship.length, orientation)
  const ok = cells.every((p) => isOpen(board, p) && (!shipAt(board, p) || shipAt(board, p)!.id === ship.id))
  return ok ? cells : null
}

/** The AI's heal: its most damaged ship, moved to a random legal spot. */
export function aiHeal(board: Board, rng: () => number = Math.random): { id: string; cells: Coord[] } | null {
  const hurt = board.ships.filter((s) => canHeal(board, s))
  if (!hurt.length) return null
  const hits = (s: Ship) => s.cells.filter((p) => board.shots[p.r][p.c] === 'hit').length
  const ship = hurt.reduce((a, b) => (hits(b) > hits(a) ? b : a))
  for (let i = 0; i < 400; i++) {
    const cells = relocation(board, ship, { r: Math.floor(rng() * SIZE), c: Math.floor(rng() * SIZE) }, rng() < 0.5 ? 'H' : 'V')
    if (cells) return { id: ship.id, cells }
  }
  return null
}

export const onCrate = (cells: Coord[], crate: Coord | null) => !!crate && cells.some((p) => sameCoord(p, crate))
