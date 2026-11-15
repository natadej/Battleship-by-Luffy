import { describe, expect, it } from 'vitest'
import { FLEET, emptyBoard, fire, placeShip, randomBoard } from './board'
import { initialState, reducer } from './game'
import { healthOf, pickRaidTargets } from './raid'
import { statsOf } from './score'
import { seeded } from './testUtils'

const destroyer = FLEET.find((s) => s.id === 'destroyer')!
const twoCellFleet = () => placeShip(emptyBoard(), destroyer, { r: 0, c: 0 }, 'H')!

function battle(player = randomBoard(seeded(1)), enemy = randomBoard(seeded(2))) {
  const s = reducer(initialState(), { type: 'setPlayerBoard', board: player })
  return reducer(s, { type: 'start', enemy, level: 4 })
}

describe('air raids', () => {
  it('picks distinct unshot squares and skips excluded ones', () => {
    let board = emptyBoard()
    for (let c = 0; c < 10; c++) board = fire(board, { r: 0, c }).board
    const picks = pickRaidTargets(board, 50, seeded(4), [{ r: 1, c: 1 }])
    expect(picks).toHaveLength(50)
    expect(new Set(picks.map((p) => `${p.r}-${p.c}`)).size).toBe(50)
    expect(picks.some((p) => p.r === 0 || (p.r === 1 && p.c === 1))).toBe(false)
    expect(pickRaidTargets(board, 200, seeded(4))).toHaveLength(90)
  })

  it('damages both boards without changing the turn, and teaches the AI', () => {
    let s = battle()
    const shipCell = s.player.ships[0].cells[0]
    s = reducer(s, { type: 'raid', enemy: [{ r: 5, c: 5 }], player: [shipCell] })
    expect(s.turn).toBe('player')
    expect(s.enemy.shots[5][5]).not.toBeNull()
    expect(s.player.shots[shipCell.r][shipCell.c]).toBe('hit')
    expect(s.ai.grid[shipCell.r][shipCell.c]).toBe('hit')
    expect(s.raided).toEqual({ enemy: [{ r: 5, c: 5 }], player: [shipCell] })
    expect(s.log[0]).toMatch(/^Air raid!/)
  })

  it('keeps raid squares out of the player accuracy', () => {
    let s = battle()
    const target = s.enemy.ships[0].cells[0]
    s = reducer(s, { type: 'raid', enemy: [target], player: [] })
    expect(statsOf(s.enemy).shots).toBe(1)
    expect(statsOf(s.enemy, s.raided.enemy).shots).toBe(0)
  })

  it('ends the game, or calls a draw when both fleets go down together', () => {
    const end = reducer(battle(randomBoard(seeded(1)), twoCellFleet()), { type: 'raid', enemy: [{ r: 0, c: 0 }, { r: 0, c: 1 }], player: [] })
    expect(end.phase).toBe('over')
    expect(end.winner).toBe('player')

    const player = randomBoard(seeded(3))
    const draw = reducer(battle(player, twoCellFleet()), {
      type: 'raid',
      enemy: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
      player: player.ships.flatMap((s) => s.cells),
    })
    expect(draw.winner).toBe('draw')
  })

  it('reports fleet health from 100% down to 0%', () => {
    let b = twoCellFleet()
    expect(healthOf(b)).toBe(1)
    b = fire(b, { r: 0, c: 0 }).board
    expect(healthOf(b)).toBe(0.5)
    b = fire(b, { r: 0, c: 1 }).board
    expect(healthOf(b)).toBe(0)
  })
})
