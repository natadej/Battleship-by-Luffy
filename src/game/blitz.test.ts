import { describe, expect, it } from 'vitest'
import { BLITZ_SECONDS, randomTarget, secondsLeft, speedBonus } from './blitz'
import { emptyBoard } from './board'

describe('blitz', () => {
  it('counts down whole seconds and stops at zero', () => {
    expect(secondsLeft(0, 0)).toBe(BLITZ_SECONDS)
    expect(secondsLeft(0, 999)).toBe(BLITZ_SECONDS)
    expect(secondsLeft(0, 3500)).toBe(BLITZ_SECONDS - 3)
    expect(secondsLeft(0, 60_000)).toBe(0)
  })

  it('pays a speed bonus only for shots that strike a ship', () => {
    expect(speedBonus(7, 3, true)).toBe(210)
    expect(speedBonus(7, 3, false)).toBe(0)
    expect(speedBonus(0, 3, true)).toBe(0)
  })

  it('picks a random square that has not been fired at', () => {
    const board = emptyBoard()
    board.shots = board.shots.map((row, r) => row.map((_, c) => (r === 4 && c === 6 ? null : 'miss')))
    expect(randomTarget(board, () => 0.99)).toEqual({ r: 4, c: 6 })
    board.shots[4][6] = 'miss'
    expect(randomTarget(board)).toBeNull()
  })
})
