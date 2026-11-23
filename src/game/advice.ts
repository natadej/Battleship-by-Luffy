import { type Board, type Coord, SIZE, inBounds } from './board'
import { knowledgeOf, probabilityGrid } from './probability'
import type { Arsenal, Special, Weapon } from './weapons'

export interface Advice {
  weapon: Weapon
  at: Coord
}

/** A special is only worth it when it covers this many times the likelihood of the best single square. */
const SPECIAL_EDGE = 1.6

/**
 * The radio officer's tip: the most likely square, and the leftover weapon expected to hit the most there.
 * Uses only what the player can see (shots fired and ships sunk), like the hint glow.
 */
export function adviseShot(board: Board, arsenal: Arsenal): Advice | null {
  const { grid, remaining } = knowledgeOf(board)
  const p = probabilityGrid(grid, remaining)
  const v = ({ r, c }: Coord) => (inBounds({ r, c }) ? p[r][c] : 0)
  const value: Record<Weapon, (t: Coord) => number> = {
    missile: v,
    nuke: (t) => {
      let sum = 0
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) sum += v({ r: t.r + dr, c: t.c + dc })
      return sum
    },
    // The gun picks across or down at random, so count the average of the two.
    mg: (t) => v(t) + (v({ r: t.r, c: t.c - 1 }) + v({ r: t.r, c: t.c + 1 }) + v({ r: t.r - 1, c: t.c }) + v({ r: t.r + 1, c: t.c })) / 2,
    // Two random open neighbours: the average neighbour, twice.
    b52: (t) => {
      const near: number[] = []
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && inBounds({ r: t.r + dr, c: t.c + dc }) && grid[t.r + dr][t.c + dc] === 'unknown') near.push(v({ r: t.r + dr, c: t.c + dc }))
      return v(t) + (near.length ? (2 * near.reduce((a, b) => a + b, 0)) / near.length : 0)
    },
  }
  const best = (w: Weapon) => {
    let top: { at: Coord; score: number } | null = null
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] !== 'unknown' || !p[r][c]) continue
        const score = value[w]({ r, c })
        if (!top || score > top.score) top = { at: { r, c }, score }
      }
    return top
  }
  const missile = best('missile')
  if (!missile) return null
  let pick: Advice & { score: number } = { weapon: 'missile', ...missile }
  for (const w of Object.keys(arsenal) as Special[]) {
    if (arsenal[w] <= 0) continue
    const b = best(w)
    if (b && b.score >= missile.score * SPECIAL_EDGE && b.score > pick.score) pick = { weapon: w, ...b }
  }
  return { weapon: pick.weapon, at: pick.at }
}
