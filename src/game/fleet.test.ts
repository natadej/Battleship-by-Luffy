import { describe, expect, it } from 'vitest'
import { createAI, chooseShot, recordShot } from './ai'
import { FLEET, allSunk, emptyBoard, fire, placeShip } from './board'
import { armFleet, enemyFleetLevels, fleetBonus, isBoss, perksOf, tierOf } from './fleet'

describe('endless missions', () => {
  it('caps the AI strategy at Admiral and has a boss every 5th mission', () => {
    expect([1, 5, 6, 40].map(tierOf)).toEqual([1, 5, 5, 5])
    expect([5, 10, 15].every(isBoss)).toBe(true)
    expect(isBoss(7)).toBe(false)
  })

  it('levels the enemy fleet one ship per mission after mission 5', () => {
    expect(Object.values(enemyFleetLevels(5))).toEqual([1, 1, 1, 1, 1])
    expect(Object.values(enemyFleetLevels(7))).toEqual([2, 2, 1, 1, 1])
    expect(Object.values(enemyFleetLevels(13))).toEqual([3, 3, 3, 2, 2])
    expect(fleetBonus(enemyFleetLevels(10))).toEqual({ b52: 1, nuke: 2, mg: 2 })
  })

  it('gives armour at ship levels 3 and 6', () => {
    expect([1, 2, 3, 5, 6, 9].map((l) => perksOf(l).armour)).toEqual([0, 0, 1, 1, 2, 2])
  })
})

describe('armour', () => {
  const destroyer = FLEET.find((s) => s.id === 'destroyer')!
  const armed = armFleet(placeShip(emptyBoard(), destroyer, { r: 0, c: 0 }, 'H')!, { destroyer: 3 }, 0, () => 0.9)

  it('never armours every block of a ship', () => {
    expect(armFleet(armed, { destroyer: 9 }, 1).ships[0].armour).toHaveLength(1)
  })

  it('takes a dent first, then a hit, and the AI finishes the dent', () => {
    const block = armed.ships[0].cells[armed.ships[0].armour![0]]
    const dent = fire(armed, block)
    expect(dent.outcome).toBe('dent')
    expect(dent.board.shots[block.r][block.c]).toBeNull()
    const ai = recordShot(createAI(), block, dent)
    expect(chooseShot(ai, Math.random, 1)).toEqual(block)
    let b = fire(dent.board, block).board
    for (const p of b.ships[0].cells) if (b.shots[p.r][p.c] === null) b = fire(b, p).board
    expect(allSunk(b)).toBe(true)
  })
})
