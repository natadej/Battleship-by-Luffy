import { type Board, type Coord, sameCoord } from './board'

export interface ShotStats {
  shots: number
  hits: number
  accuracy: number
}

/** Aimed shots fired at a board and how many of them hit; `exclude` drops air-raid squares. */
export function statsOf(board: Board, exclude: Coord[] = []): ShotStats {
  let shots = 0
  let hits = 0
  board.shots.forEach((row, r) =>
    row.forEach((m, c) => {
      if (m === null || exclude.some((e) => sameCoord(e, { r, c }))) return
      shots++
      if (m === 'hit') hits++
    }),
  )
  return { shots, hits, accuracy: shots ? hits / shots : 0 }
}

export const WIN_BONUS = 500

/**
 * Score = (accuracy × 1000 + win bonus) × level, halved when the probability shade was used.
 * Accuracy dominates, so the leaderboard rewards whoever wastes the fewest shots.
 */
export function computeScore(o: { accuracy: number; level: number; won: boolean; assisted: boolean; combo?: number }): number {
  const base = (o.accuracy * 1000 + (o.won ? WIN_BONUS : 0)) * o.level + (o.combo ?? 0)
  return Math.round(base * (o.assisted ? 0.5 : 1))
}

export const pct = (x: number) => `${Math.round(x * 100)}%`
