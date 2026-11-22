import type { Board, Coord } from './board'

/** Blitz mode: each of the player's shots must be fired within this many seconds. */
export const BLITZ_SECONDS = 10
const KEY = 'battleship-blitz'

export const secondsLeft = (startedAt: number, now: number) => Math.max(0, BLITZ_SECONDS - Math.floor((now - startedAt) / 1000))

/** Fast shots that strike a ship earn 10 points per second left, times the mission. */
export const speedBonus = (seconds: number, mission: number, struck: boolean) => (struck ? seconds * 10 * mission : 0)

/** A square the player hasn't fired at yet, for when the clock runs out. */
export function randomTarget(board: Board, rng: () => number = Math.random): Coord | null {
  const open: Coord[] = []
  board.shots.forEach((row, r) => row.forEach((s, c) => s === null && open.push({ r, c })))
  return open.length ? open[Math.floor(rng() * open.length)] : null
}

export const loadBlitz = () => typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'
export const saveBlitz = (on: boolean) => localStorage.setItem(KEY, on ? '1' : '0')
