import { describe, expect, it } from 'vitest'
import { FLEET, emptyBoard, placeShip, randomBoard } from './board'
import { initialState, reducer } from './game'
import { seeded } from './testUtils'

const destroyer = FLEET.find((s) => s.id === 'destroyer')!

describe('game reducer', () => {
  it('cannot start until all five ships are placed', () => {
    const s = reducer(initialState(), { type: 'start', enemy: randomBoard(), level: 4 })
    expect(s.phase).toBe('placement')
  })

  it('alternates turns and ignores out-of-turn or repeat shots', () => {
    const rng = seeded(3)
    let s = reducer(initialState(), { type: 'setPlayerBoard', board: randomBoard(rng) })
    s = reducer(s, { type: 'start', enemy: randomBoard(rng), level: 4 })
    expect(s.phase).toBe('playing')
    expect(s.turn).toBe('player')

    const same = reducer(s, { type: 'aiFire', coord: { r: 0, c: 0 } })
    expect(same).toBe(s)

    s = reducer(s, { type: 'playerFire', coord: { r: 0, c: 0 } })
    expect(s.turn).toBe('ai')
    expect(reducer(s, { type: 'playerFire', coord: { r: 1, c: 1 } })).toBe(s)

    s = reducer(s, { type: 'aiFire', coord: { r: 0, c: 0 } })
    expect(s.turn).toBe('player')
    expect(reducer(s, { type: 'playerFire', coord: { r: 0, c: 0 } })).toBe(s)
  })

  it('declares the player the winner when the enemy fleet is sunk', () => {
    const enemy = placeShip(emptyBoard(), destroyer, { r: 0, c: 0 }, 'H')!
    let s = reducer(initialState(), { type: 'setPlayerBoard', board: randomBoard(seeded(1)) })
    s = reducer(s, { type: 'start', enemy, level: 4 })
    s = reducer(s, { type: 'playerFire', coord: { r: 0, c: 0 } })
    s = reducer(s, { type: 'aiFire', coord: { r: 9, c: 9 } })
    s = reducer(s, { type: 'playerFire', coord: { r: 0, c: 1 } })
    expect(s.phase).toBe('over')
    expect(s.winner).toBe('player')
  })
})
