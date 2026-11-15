import { describe, expect, it } from 'vitest'
import { emptyBoard, fire, randomBoard } from './board'
import { computeScore, statsOf } from './score'
import { seeded } from './testUtils'

describe('score', () => {
  it('counts shots, hits and accuracy on a board', () => {
    const board = randomBoard(seeded(1))
    const [ship] = board.ships
    let b = fire(board, ship.cells[0]).board
    const empty = [...Array(100).keys()].map((i) => ({ r: Math.floor(i / 10), c: i % 10 })).find((p) => !b.ships.some((s) => s.cells.some((c) => c.r === p.r && c.c === p.c)))!
    b = fire(b, empty).board
    expect(statsOf(b)).toEqual({ shots: 2, hits: 1, accuracy: 0.5 })
    expect(statsOf(emptyBoard()).accuracy).toBe(0)
  })

  it('scales with accuracy and level, rewards winning, halves assisted games', () => {
    const base = { accuracy: 0.5, level: 1 as const, won: false, assisted: false }
    expect(computeScore(base)).toBe(500)
    expect(computeScore({ ...base, level: 5 })).toBe(2500)
    expect(computeScore({ ...base, won: true })).toBe(1000)
    expect(computeScore({ ...base, assisted: true })).toBe(250)
  })
})
