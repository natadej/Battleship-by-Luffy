import { describe, expect, it } from 'vitest'
import { FLEET, emptyBoard, fire, placeShip } from './board'
import { adviseShot, intelShot } from './advice'

const none = { nuke: 0, mg: 0, b52: 0 }

describe('radio advice', () => {
  it('points a missile at the most likely square when no specials are left', () => {
    const a = adviseShot(emptyBoard(), none)!
    expect(a.weapon).toBe('missile')
    expect([4, 5]).toContain(a.at.r)
    expect([4, 5]).toContain(a.at.c)
  })

  it('calls in the nuke on an untouched sea, where it covers the most likely squares', () => {
    expect(adviseShot(emptyBoard(), { nuke: 1, mg: 1, b52: 1 })!.weapon).toBe('nuke')
  })

  it('aims right next to an open hit, and never at a square already shot', () => {
    const cruiser = FLEET.find((s) => s.id === 'cruiser')!
    const board = fire(placeShip(emptyBoard(), cruiser, { r: 2, c: 2 }, 'H')!, { r: 2, c: 3 }).board
    const a = adviseShot(board, none)!
    expect(Math.abs(a.at.r - 2) + Math.abs(a.at.c - 3)).toBe(1)
    expect(board.shots[a.at.r][a.at.c]).toBeNull()
  })

  it('has nothing to say once every square is shot', () => {
    let board = emptyBoard()
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) board = fire(board, { r, c }).board
    expect(adviseShot(board, { nuke: 2, mg: 2, b52: 2 })).toBeNull()
  })
})

describe('radio intel', () => {
  it('points at an unshot square of a ship still afloat, or nothing once all are sunk', () => {
    let b = placeShip(emptyBoard(), FLEET[4], { r: 0, c: 0 }, 'H')!
    b = placeShip(b, FLEET[3], { r: 5, c: 5 }, 'V')!
    b = fire(b, { r: 0, c: 0 }).board
    expect(intelShot(b, () => 0)).toEqual({ r: 0, c: 1 })
    b = fire(b, { r: 0, c: 1 }).board
    for (let i = 0; i < 6; i++) expect(intelShot(b, () => i / 6)).toMatchObject({ c: 5 })
    for (const r of [5, 6, 7]) b = fire(b, { r, c: 5 }).board
    expect(intelShot(b)).toBeNull()
  })
})
