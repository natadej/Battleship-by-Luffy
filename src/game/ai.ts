import { type Coord, type FireResult, SIZE, createGrid, inBounds } from './board'

/** What the AI knows about each cell of the player's board. */
export type Knowledge = 'unknown' | 'miss' | 'hit' | 'sunk'

export interface AIState {
  grid: Knowledge[][]
}

export type AIMode = 'hunt' | 'target'

const DIRS: Coord[] = [
  { r: -1, c: 0 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
  { r: 0, c: 1 },
]

export const createAI = (): AIState => ({ grid: createGrid<Knowledge>('unknown') })

const at = (s: AIState, { r, c }: Coord) => s.grid[r][c]
const isUnknown = (s: AIState, p: Coord) => inBounds(p) && at(s, p) === 'unknown'
const isOpenHit = (s: AIState, p: Coord) => inBounds(p) && at(s, p) === 'hit'
const add = (a: Coord, b: Coord): Coord => ({ r: a.r + b.r, c: a.c + b.c })
const pick = <T>(items: T[], rng: () => number) => items[Math.floor(rng() * items.length)]

function cellsWhere(s: AIState, pred: (k: Knowledge, p: Coord) => boolean): Coord[] {
  const out: Coord[] = []
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (pred(s.grid[r][c], { r, c })) out.push({ r, c })
  return out
}

/** Hits that don't yet belong to a sunk ship — these drive Target mode. */
export const openHits = (s: AIState) => cellsWhere(s, (k) => k === 'hit')

export const aiMode = (s: AIState): AIMode => (openHits(s).length ? 'target' : 'hunt')

/**
 * Target mode candidates.
 * 1. If two or more open hits line up, the ship's orientation is known:
 *    only shoot the unknown cells at either end of that line.
 * 2. Otherwise shoot any unknown neighbour (N/S/E/W) of an open hit.
 */
export function targetCandidates(s: AIState): Coord[] {
  const hits = openHits(s)
  const lineEnds: Coord[] = []
  for (const h of hits) {
    for (const d of DIRS) {
      if (!isOpenHit(s, add(h, d))) continue
      // Walk from h through consecutive hits in direction d; the first non-hit is a line end.
      let p = add(h, d)
      while (isOpenHit(s, p)) p = add(p, d)
      if (isUnknown(s, p)) lineEnds.push(p)
    }
  }
  if (lineEnds.length) return dedupe(lineEnds)
  return dedupe(hits.flatMap((h) => DIRS.map((d) => add(h, d)).filter((p) => isUnknown(s, p))))
}

/**
 * Hunt mode candidates: random unknown cells on a checkerboard.
 * The smallest ship is 2 long, so every ship covers at least one cell of either colour;
 * hunting one colour halves the search space without ever missing a ship.
 */
export function huntCandidates(s: AIState): Coord[] {
  const parity = cellsWhere(s, (k, { r, c }) => k === 'unknown' && (r + c) % 2 === 0)
  return parity.length ? parity : cellsWhere(s, (k) => k === 'unknown')
}

export function chooseShot(s: AIState, rng: () => number = Math.random): Coord {
  const targets = targetCandidates(s)
  if (targets.length) return pick(targets, rng)
  const hunt = huntCandidates(s)
  if (!hunt.length) throw new Error('No cells left to fire at')
  return pick(hunt, rng)
}

export function recordShot(s: AIState, coord: Coord, result: FireResult): AIState {
  const grid = s.grid.map((row) => row.slice())
  grid[coord.r][coord.c] = result.outcome === 'miss' ? 'miss' : 'hit'
  // A sinking is announced, so the AI can retire that ship's hits and stop targeting around them.
  if (result.outcome === 'sunk' && result.ship) {
    for (const { r, c } of result.ship.cells) grid[r][c] = 'sunk'
  }
  return { grid }
}

function dedupe(cells: Coord[]): Coord[] {
  const seen = new Set<string>()
  return cells.filter(({ r, c }) => {
    const key = `${r},${c}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
