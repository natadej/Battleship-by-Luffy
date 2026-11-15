import { describe, expect, it } from 'vitest'
import { FLEET, emptyBoard, fire, placeShip } from './board'
import { knowledgeOf, normalize, probabilityGrid } from './probability'

describe('probability grid', () => {
  it('is highest in the middle of an empty board and zero on known cells', () => {
    const { grid, remaining } = knowledgeOf(fire(emptyBoard(), { r: 4, c: 4 }).board)
    const p = normalize(probabilityGrid(grid, remaining))
    expect(p[4][4]).toBe(0)
    expect(p[0][0]).toBeLessThan(p[5][5])
    expect(Math.max(...p.flat())).toBe(1)
  })

  it('only uses visible information: sunk ships are removed, unsunk ones stay hidden', () => {
    const destroyer = FLEET.find((s) => s.id === 'destroyer')!
    let board = placeShip(emptyBoard(), destroyer, { r: 0, c: 0 }, 'H')!
    board = fire(board, { r: 0, c: 0 }).board
    expect(knowledgeOf(board).grid[0][0]).toBe('hit')
    board = fire(board, { r: 0, c: 1 }).board
    const k = knowledgeOf(board)
    expect(k.grid[0][1]).toBe('sunk')
    expect(k.remaining).toEqual([5, 4, 3, 3])
  })
})
