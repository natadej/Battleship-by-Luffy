import { describe, expect, it } from 'vitest'
import { FLEET, allSunk, emptyBoard, fire, placeShip, randomBoard, shipCells } from './board'
import { seeded } from './testUtils'

const destroyer = FLEET.find((s) => s.id === 'destroyer')!
const carrier = FLEET.find((s) => s.id === 'carrier')!

describe('placement', () => {
  it('builds horizontal and vertical cells', () => {
    expect(shipCells({ r: 2, c: 3 }, 3, 'H')).toEqual([{ r: 2, c: 3 }, { r: 2, c: 4 }, { r: 2, c: 5 }])
    expect(shipCells({ r: 2, c: 3 }, 2, 'V')).toEqual([{ r: 2, c: 3 }, { r: 3, c: 3 }])
  })

  it('rejects out-of-bounds and overlapping ships', () => {
    expect(placeShip(emptyBoard(), carrier, { r: 0, c: 6 }, 'H')).toBeNull()
    expect(placeShip(emptyBoard(), carrier, { r: 6, c: 0 }, 'V')).toBeNull()
    const b = placeShip(emptyBoard(), carrier, { r: 0, c: 0 }, 'H')!
    expect(placeShip(b, destroyer, { r: 0, c: 4 }, 'V')).toBeNull()
    expect(placeShip(b, destroyer, { r: 1, c: 4 }, 'V')).not.toBeNull()
  })

  it('re-placing a ship moves it instead of duplicating it', () => {
    const a = placeShip(emptyBoard(), destroyer, { r: 0, c: 0 }, 'H')!
    const b = placeShip(a, destroyer, { r: 0, c: 1 }, 'H')!
    expect(b.ships).toHaveLength(1)
    expect(b.ships[0].cells[0]).toEqual({ r: 0, c: 1 })
  })

  it('randomBoard always places the full fleet without overlap', () => {
    const rng = seeded(1)
    for (let i = 0; i < 200; i++) {
      const board = randomBoard(rng)
      expect(board.ships).toHaveLength(FLEET.length)
      const cells = board.ships.flatMap((s) => s.cells.map(({ r, c }) => `${r},${c}`))
      expect(new Set(cells).size).toBe(17)
      expect(cells.every((k) => k.split(',').every((n) => +n >= 0 && +n < 10))).toBe(true)
    }
  })
})

describe('firing', () => {
  it('reports miss, hit, sunk and win', () => {
    let board = placeShip(emptyBoard(), destroyer, { r: 5, c: 5 }, 'H')!
    let res = fire(board, { r: 0, c: 0 })
    expect(res.outcome).toBe('miss')
    res = fire(res.board, { r: 5, c: 5 })
    expect(res.outcome).toBe('hit')
    expect(allSunk(res.board)).toBe(false)
    res = fire(res.board, { r: 5, c: 6 })
    expect(res.outcome).toBe('sunk')
    expect(res.ship?.id).toBe('destroyer')
    expect(allSunk(res.board)).toBe(true)
    board = res.board
    expect(() => fire(board, { r: 5, c: 6 })).toThrow(/Already fired/)
  })

  it('does not mutate the original board', () => {
    const board = emptyBoard()
    fire(board, { r: 1, c: 1 })
    expect(board.shots[1][1]).toBeNull()
  })
})
