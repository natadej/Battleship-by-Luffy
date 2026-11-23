import { describe, expect, it } from 'vitest'
import { blockCost, partsFor, playerFleetLevels, renameShip, shipName, upgradeBlock } from './garage'

describe('garage', () => {
  it('pays more parts for stars, later missions and bosses, and 1 for a loss', () => {
    expect(partsFor(false, 0, 7)).toBe(1)
    expect(partsFor(true, 1, 1)).toBe(2)
    expect(partsFor(true, 3, 4)).toBe(4)
    expect(partsFor(true, 3, 10, true)).toBe(12)
  })

  it('levels a ship up once every block is upgraded, then starts its blocks again', () => {
    let g = {}
    let parts = 10
    for (const b of [1, 0]) {
      const u = upgradeBlock(g, parts, 'destroyer', b)!
      ;({ garage: g, parts } = u)
      expect(u.levelled).toBe(b === 0)
    }
    expect(g).toEqual({ destroyer: { level: 2, blocks: [] } })
    expect(parts).toBe(8)
    const u = upgradeBlock(g, parts, 'destroyer', 0)!
    expect(u.parts).toBe(8 - blockCost(2))
    expect(playerFleetLevels(u.garage)).toMatchObject({ destroyer: 2, carrier: 1 })
  })

  it('refuses a block already upgraded, out of range, too expensive, or on a wreck', () => {
    const { garage } = upgradeBlock({}, 5, 'cruiser', 2)!
    expect(upgradeBlock(garage, 5, 'cruiser', 2)).toBeNull()
    expect(upgradeBlock(garage, 5, 'cruiser', 3)).toBeNull()
    expect(upgradeBlock({}, 0, 'cruiser', 0)).toBeNull()
    expect(upgradeBlock({}, 5, 'cruiser', 0, ['cruiser'])).toBeNull()
  })

  it('keeps a short custom name, and falls back to the class name', () => {
    expect(shipName(renameShip({}, 'carrier', '  Thunder of the deep sea  '), 'carrier')).toBe('Thunder of the')
    expect(shipName(renameShip({}, 'carrier', '   '), 'carrier')).toBe('Carrier')
  })
})
