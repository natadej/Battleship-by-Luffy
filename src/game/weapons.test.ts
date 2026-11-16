import { describe, expect, it } from 'vitest'
import { FLEET, emptyBoard, fire, placeShip, randomBoard } from './board'
import { initialState, reducer } from './game'
import { seeded } from './testUtils'
import { aiHeal, aiWeapon, canHeal, crateSpot, footprint, fullArsenal, relocation } from './weapons'
import { createAI } from './ai'

const destroyer = FLEET.find((s) => s.id === 'destroyer')!
const key = (p: { r: number; c: number }) => `${p.r},${p.c}`

describe('weapon footprints', () => {
  const board = emptyBoard()
  it('missile hits only the target', () => {
    expect(footprint('missile', { r: 4, c: 4 }, board)).toEqual([{ r: 4, c: 4 }])
  })

  it('nuke hits the 3x3 around the target, clipped at the edge', () => {
    expect(footprint('nuke', { r: 4, c: 4 }, board)).toHaveLength(9)
    expect(footprint('nuke', { r: 0, c: 0 }, board)).toHaveLength(4)
  })

  it('machine gun hits 3 squares in one row or column through the target', () => {
    for (let seed = 1; seed < 20; seed++) {
      const cells = footprint('mg', { r: 5, c: 5 }, board, seeded(seed))
      expect(cells).toHaveLength(3)
      expect(cells.every((p) => p.r === 5) || cells.every((p) => p.c === 5)).toBe(true)
    }
  })

  it('B-52 hits the target and 2 random neighbours', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed < 40; seed++) {
      const cells = footprint('b52', { r: 5, c: 5 }, board, seeded(seed))
      expect(cells).toHaveLength(3)
      expect(cells[0]).toEqual({ r: 5, c: 5 })
      expect(new Set(cells.map(key)).size).toBe(3)
      cells.slice(1).forEach((p) => {
        expect(Math.abs(p.r - 5) <= 1 && Math.abs(p.c - 5) <= 1).toBe(true)
        seen.add(key(p))
      })
    }
    expect(seen.size).toBeGreaterThan(4)
  })

  it('skips squares already shot', () => {
    const shot = fire(emptyBoard(), { r: 4, c: 5 }).board
    expect(footprint('nuke', { r: 4, c: 4 }, shot).map(key)).not.toContain('4,5')
  })
})

describe('weapons in the reducer', () => {
  const start = (enemy = randomBoard(seeded(2))) => {
    const s = reducer(initialState(), { type: 'setPlayerBoard', board: randomBoard(seeded(1)) })
    return reducer(s, { type: 'start', enemy, level: 3, crates: { player: crateSpot(s.player, seeded(5)), enemy: crateSpot(enemy, seeded(6)) } })
  }

  it('a nuke marks every square it covers and is used up', () => {
    let s = start()
    const cells = footprint('nuke', { r: 4, c: 4 }, s.enemy)
    s = reducer(s, { type: 'playerFire', coord: { r: 4, c: 4 }, weapon: 'nuke', cells })
    expect(cells.every((p) => s.enemy.shots[p.r][p.c] !== null)).toBe(true)
    expect(s.arsenal.player.nuke).toBe(1)
    expect(s.tally.player.shots).toBe(9)
    s = reducer(s, { type: 'aiFire', coord: { r: 0, c: 0 } })
    s = reducer(s, { type: 'playerFire', coord: { r: 9, c: 9 }, weapon: 'nuke', cells: [{ r: 9, c: 9 }] })
    expect(s.arsenal.player.nuke).toBe(0)
    s = reducer(s, { type: 'aiFire', coord: { r: 0, c: 1 } })
    expect(reducer(s, { type: 'playerFire', coord: { r: 9, c: 0 }, weapon: 'nuke', cells: [{ r: 9, c: 0 }] })).toBe(s)
  })

  it('the AI uses the same arsenal and footprints', () => {
    let s = start()
    s = reducer(s, { type: 'playerFire', coord: { r: 0, c: 0 } })
    const cells = footprint('mg', { r: 5, c: 5 }, s.player, seeded(3))
    s = reducer(s, { type: 'aiFire', coord: { r: 5, c: 5 }, weapon: 'mg', cells })
    expect(cells.every((p) => s.player.shots[p.r][p.c] !== null)).toBe(true)
    expect(s.arsenal.ai.mg).toBe(1)
    expect(s.tally.ai.shots).toBe(3)
  })

  it('no box at the start; one drops later and only once', () => {
    let s = reducer(initialState(), { type: 'setPlayerBoard', board: randomBoard(seeded(1)) })
    s = reducer(s, { type: 'start', enemy: randomBoard(seeded(2)), level: 3 })
    expect(s.crates).toEqual({ player: null, enemy: null })
    s = reducer(s, { type: 'playerFire', coord: { r: 0, c: 0 } })
    s = reducer(s, { type: 'aiFire', coord: { r: 0, c: 0 } })
    expect(s.round).toBe(1)
    const at = crateSpot(s.enemy, seeded(6))
    s = reducer(s, { type: 'drop', board: 'enemy', at })
    expect(s.crates.enemy).toEqual(at)
    expect(reducer(s, { type: 'drop', board: 'player', at: crateSpot(s.player, seeded(7)) })).toBe(s)
    s = reducer(s, { type: 'playerFire', coord: at })
    expect(s.kits.player).toBe(true)
  })

  it('shooting the healing box collects a kit', () => {
    let s = start()
    const crate = s.crates.enemy!
    s = reducer(s, { type: 'playerFire', coord: crate })
    expect(s.crates.enemy).toBeNull()
    expect(s.kits.player).toBe(true)
  })

  it('the kit repairs a damaged ship and moves it to unshot water', () => {
    const mine = placeShip(emptyBoard(), destroyer, { r: 0, c: 0 }, 'H')!
    let s = reducer(initialState(), { type: 'setPlayerBoard', board: { ...randomBoard(seeded(1)), ships: [] } })
    s = { ...s, player: mine }
    s = { ...reducer(s, { type: 'start', enemy: randomBoard(seeded(2)), level: 3 }), phase: 'playing' }
    s = reducer(s, { type: 'playerFire', coord: { r: 9, c: 9 } })
    s = reducer(s, { type: 'aiFire', coord: { r: 0, c: 0 } })
    s = { ...s, kits: { ...s.kits, player: true } }
    const ship = s.player.ships[0]
    expect(canHeal(s.player, ship)).toBe(true)
    expect(relocation(s.player, ship, { r: 0, c: 0 }, 'V')).toBeNull()
    const cells = relocation(s.player, ship, { r: 5, c: 5 }, 'V')!
    s = reducer(s, { type: 'heal', side: 'player', id: ship.id, cells })
    expect(s.player.ships[0].cells).toEqual(cells)
    expect(s.player.shots[0][0]).toBe('miss')
    expect(s.ai.grid[0][0]).toBe('miss')
    expect(s.kits.player).toBe(false)
    expect(s.tally.ai.hits).toBe(1)
  })

  it('the AI heals its most damaged ship to a legal spot', () => {
    let b = randomBoard(seeded(4))
    const ship = b.ships[0]
    b = fire(b, ship.cells[0]).board
    const heal = aiHeal(b, seeded(9))!
    expect(heal.id).toBe(ship.id)
    expect(heal.cells.every((p) => b.shots[p.r][p.c] === null)).toBe(true)
  })

  it('the AI only picks weapons it still has', () => {
    const none = { nuke: 0, mg: 0, b52: 0 }
    for (let seed = 1; seed < 30; seed++) {
      expect(aiWeapon(createAI(), none, 5, seeded(seed))).toBe('missile')
      expect(['missile', 'nuke', 'mg', 'b52']).toContain(aiWeapon(createAI(), fullArsenal(), 5, seeded(seed)))
    }
  })
})
