import { type Board, type Coord, SIZE, sameCoord } from './board'

/** Seconds of battle between air raids. */
export const RAID_MS = 10_000
/** Squares each raid hits on each board. */
export const RAID_SHOTS = 2

/** Up to n distinct random unshot squares, skipping any already targeted by a shot in flight. */
export function pickRaidTargets(board: Board, n: number, rng: () => number = Math.random, exclude: Coord[] = []): Coord[] {
  const open: Coord[] = []
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (board.shots[r][c] === null && !exclude.some((e) => sameCoord(e, { r, c }))) open.push({ r, c })
  const picked: Coord[] = []
  while (picked.length < n && open.length) picked.push(open.splice(Math.floor(rng() * open.length), 1)[0])
  return picked
}

/** Up to n distinct random squares that have already been fired at (raids can't open new squares). */
export function pickAttacked(board: Board, n: number, rng: () => number = Math.random): Coord[] {
  const shot: Coord[] = []
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board.shots[r][c] !== null) shot.push({ r, c })
  const picked: Coord[] = []
  while (picked.length < n && shot.length) picked.push(shot.splice(Math.floor(rng() * shot.length), 1)[0])
  return picked
}

/** Share of the fleet still afloat: 1 = untouched, 0 = every ship square hit. */
export function healthOf(board: Board): number {
  const total = board.ships.reduce((n, s) => n + s.length, 0)
  if (!total) return 1
  const hits = board.ships.reduce((n, s) => n + s.cells.filter((p) => board.shots[p.r][p.c] === 'hit').length, 0)
  return 1 - hits / total
}
