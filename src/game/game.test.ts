import { describe, expect, it } from 'vitest'
import { FLEET, emptyBoard, placeShip, randomBoard } from './board'
import { type GameState, initialState, reducer } from './game'
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

  it('lets a side fire again after a hit until it misses', () => {
    const mine = placeShip(emptyBoard(), destroyer, { r: 0, c: 0 }, 'H')!
    const enemy = placeShip(emptyBoard(), FLEET[0], { r: 0, c: 0 }, 'H')!
    let s: GameState = { ...initialState(), player: mine, enemy, phase: 'playing' }
    s = reducer(s, { type: 'playerFire', coord: { r: 0, c: 0 } })
    expect([s.turn, s.again]).toEqual(['player', true])
    s = reducer(s, { type: 'playerFire', coord: { r: 5, c: 5 } })
    expect([s.turn, s.again]).toEqual(['ai', false])

    s = reducer(s, { type: 'aiFire', coord: { r: 0, c: 0 } })
    expect([s.turn, s.again, s.round]).toEqual(['ai', true, 0])
    s = reducer(s, { type: 'aiFire', coord: { r: 9, c: 9 } })
    expect([s.turn, s.again, s.round]).toEqual(['player', false, 1])
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

describe('lucky chest bonus', () => {
  it('adds one extra special to the player for the next battle', () => {
    const placed = reducer(initialState(), { type: 'setPlayerBoard', board: randomBoard(seeded(5)) })
    const s = reducer(placed, { type: 'start', enemy: randomBoard(), level: 1, bonus: 'nuke' })
    expect(s.arsenal.player.nuke).toBe(3)
    expect(s.arsenal.ai.nuke).toBe(2)
  })
})
