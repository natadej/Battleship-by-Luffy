import { type Board, type Orientation, FLEET, SIZE, createGrid, isSunk, shipCells } from './board'

/** What a shooter knows about each cell of the opponent's board. */
export type Knowledge = 'unknown' | 'miss' | 'hit' | 'sunk'

/** Placements that cover open hits are far more likely, so they count for much more. */
const HIT_WEIGHT = 30

/**
 * Probability density: for every ship still afloat, count each placement that fits the known
 * shots and add its weight to the unknown cells it covers. Returns raw scores (0 for known cells).
 */
export function probabilityGrid(grid: Knowledge[][], remaining: number[]): number[][] {
  const scores = createGrid(0)
  for (const length of remaining) {
    for (const orientation of ['H', 'V'] as Orientation[]) {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const cells = shipCells({ r, c }, length, orientation)
          if (cells.some((p) => p.r >= SIZE || p.c >= SIZE)) continue
          const marks = cells.map((p) => grid[p.r][p.c])
          if (marks.some((k) => k === 'miss' || k === 'sunk')) continue
          const weight = HIT_WEIGHT ** marks.filter((k) => k === 'hit').length
          for (const p of cells) if (grid[p.r][p.c] === 'unknown') scores[p.r][p.c] += weight
        }
      }
    }
  }
  return scores
}

/** Scales scores to 0..1 relative to the best cell. */
export function normalize(scores: number[][]): number[][] {
  const max = Math.max(0, ...scores.flat())
  return scores.map((row) => row.map((v) => (max ? v / max : 0)))
}

/** Derives what the player legitimately knows about an enemy board: shots fired and ships sunk. */
export function knowledgeOf(board: Board): { grid: Knowledge[][]; remaining: number[] } {
  const grid = board.shots.map((row) => row.map<Knowledge>((s) => (s === null ? 'unknown' : s)))
  const remaining = FLEET.map((s) => s.length)
  for (const ship of board.ships) {
    if (!isSunk(board, ship)) continue
    for (const { r, c } of ship.cells) grid[r][c] = 'sunk'
    remaining.splice(remaining.indexOf(ship.length), 1)
  }
  return { grid, remaining }
}
