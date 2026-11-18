import { describe, expect, it } from 'vitest'
import { NEW_PROGRESS, buySkin, comboBonus, dailyAfterWin, liveStreak, openChest, recordBattle, seededRng, starsFor } from './rewards'

const win = { won: true, accuracy: 0.5, level: 2 as const, bestCombo: 2, shipsLost: 1, daily: false }

describe('rewards', () => {
  it('gives stars for winning and accuracy', () => {
    expect(starsFor(false, 0.9)).toBe(0)
    expect(starsFor(true, 0.2)).toBe(1)
    expect(starsFor(true, 0.4)).toBe(2)
    expect(starsFor(true, 0.6)).toBe(3)
  })

  it('scores combos from the second hit in a row', () => {
    expect(comboBonus(1, 3)).toBe(0)
    expect(comboBonus(2, 3)).toBe(150)
    expect(comboBonus(4, 1)).toBe(150)
  })

  it('keeps the best stars per level and pays coins', () => {
    const a = recordBattle(NEW_PROGRESS, win, '2026-11-16')
    expect(a.stars).toBe(2)
    expect(a.progress.stars[2]).toBe(2)
    expect(a.progress.coins).toBe(30)
    expect(a.badges).toContain('first-win')
    const b = recordBattle(a.progress, { ...win, accuracy: 0.1 }, '2026-11-16')
    expect(b.progress.stars[2]).toBe(2)
    expect(b.badges).not.toContain('first-win')
  })

  it('awards badges for a flawless sharp win and a long combo', () => {
    const r = recordBattle(NEW_PROGRESS, { ...win, accuracy: 0.7, shipsLost: 0, bestCombo: 5, level: 5 }, '2026-11-16')
    expect(r.badges).toEqual(expect.arrayContaining(['sharpshooter', 'untouchable', 'combo-4', 'admiral']))
  })

  it('counts the daily streak once per day and resets after a missed day', () => {
    let d = dailyAfterWin(NEW_PROGRESS.daily, '2026-11-14')
    d = dailyAfterWin(d, '2026-11-15')
    expect(dailyAfterWin(d, '2026-11-15')).toBe(d)
    d = dailyAfterWin(d, '2026-11-16')
    expect(d).toEqual({ last: '2026-11-16', streak: 3, best: 3 })
    expect(liveStreak(d, '2026-11-17')).toBe(3)
    expect(liveStreak(d, '2026-11-18')).toBe(0)
    expect(dailyAfterWin(d, '2026-11-18').streak).toBe(1)
  })

  it('pays the daily reward only on the first win of the day', () => {
    const daily = { ...win, daily: true }
    const a = recordBattle(NEW_PROGRESS, daily, '2026-12-01')
    expect(a.coins).toBe(50)
    expect(recordBattle(a.progress, daily, '2026-12-01').coins).toBe(0)
    expect(a.progress.stars).toEqual({})
  })

  it('makes the same daily numbers for the same day', () => {
    const a = seededRng('2026-11-16')
    const b = seededRng('2026-11-16')
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(seededRng('2026-11-17')()).not.toBe(seededRng('2026-11-16')())
  })

  it('opens a chest with coins or a bonus special', () => {
    expect(openChest(() => 0.1)).toEqual({ kind: 'weapon', weapon: 'nuke' })
    expect(openChest(() => 0.9)).toEqual({ kind: 'coins', amount: 60 })
  })

  it('buys a skin only with enough coins, then equips it for free', () => {
    expect(buySkin(NEW_PROGRESS, 'ship-bubblegum')).toBe(NEW_PROGRESS)
    const rich = buySkin({ ...NEW_PROGRESS, coins: 100 }, 'ship-bubblegum')
    expect(rich.coins).toBe(40)
    expect(rich.ship).toBe('ship-bubblegum')
    expect(buySkin({ ...rich, ship: 'ship-sunny' }, 'ship-bubblegum').ship).toBe('ship-bubblegum')
  })
})
