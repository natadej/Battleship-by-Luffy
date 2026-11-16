import type { Level } from './ai'
import type { Special } from './weapons'

/** Everything a player has earned on this device: coins, stars, badges, skins and the daily streak. */
export interface Progress {
  coins: number
  /** Best stars (1-3) per campaign level. */
  stars: Partial<Record<Level, number>>
  badges: string[]
  owned: string[]
  ship: string
  sea: string
  daily: { last: string | null; streak: number; best: number }
  /** An extra special won from a lucky chest, added to the next battle. */
  bonus: Special | null
}

export const NEW_PROGRESS: Progress = {
  coins: 0,
  stars: {},
  badges: [],
  owned: ['ship-sunny', 'sea-tropical'],
  ship: 'ship-sunny',
  sea: 'sea-tropical',
  daily: { last: null, streak: 0, best: 0 },
  bonus: null,
}

export interface Skin {
  id: string
  kind: 'ship' | 'sea'
  name: string
  icon: string
  price: number
}

export const SKINS: Skin[] = [
  { id: 'ship-sunny', kind: 'ship', name: 'Sunny', icon: '🟡', price: 0 },
  { id: 'ship-bubblegum', kind: 'ship', name: 'Bubblegum', icon: '🩷', price: 60 },
  { id: 'ship-jungle', kind: 'ship', name: 'Jungle', icon: '🟢', price: 100 },
  { id: 'ship-galaxy', kind: 'ship', name: 'Galaxy', icon: '🟣', price: 150 },
  { id: 'ship-gold', kind: 'ship', name: 'Pirate gold', icon: '🏴‍☠️', price: 250 },
  { id: 'sea-tropical', kind: 'sea', name: 'Tropical', icon: '🏝️', price: 0 },
  { id: 'sea-sunset', kind: 'sea', name: 'Sunset', icon: '🌅', price: 120 },
  { id: 'sea-night', kind: 'sea', name: 'Starry night', icon: '🌙', price: 180 },
  { id: 'sea-candy', kind: 'sea', name: 'Candy', icon: '🍬', price: 220 },
]

export interface Badge {
  id: string
  name: string
  icon: string
  desc: string
}

export const BADGES: Badge[] = [
  { id: 'first-win', name: 'First victory', icon: '🥇', desc: 'Win a battle' },
  { id: 'sharpshooter', name: 'Sharpshooter', icon: '🎯', desc: 'Win with 60% accuracy or better' },
  { id: 'untouchable', name: 'Untouchable', icon: '🛡️', desc: 'Win without losing a ship' },
  { id: 'combo-4', name: 'Combo king', icon: '🔥', desc: 'Hit 4 times in a row' },
  { id: 'healer', name: 'Ship doctor', icon: '💖', desc: 'Fix a ship with a healing kit' },
  { id: 'admiral', name: 'Admiral', icon: '👑', desc: 'Beat all 5 levels' },
  { id: 'daily-3', name: 'Daily sailor', icon: '📅', desc: 'Win the daily challenge 3 days in a row' },
  { id: 'collector', name: 'Collector', icon: '🎨', desc: 'Own 4 skins' },
]

export const starRow = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n)

/** 1 star for a win, 2 at 40% accuracy, 3 at 60%. */
export function starsFor(won: boolean, accuracy: number): number {
  if (!won) return 0
  return accuracy >= 0.6 ? 3 : accuracy >= 0.4 ? 2 : 1
}

/** Bonus points for a volley that extends a hit streak: 50 per step past the first, times the level. */
export const comboBonus = (combo: number, level: Level) => (combo >= 2 ? 50 * (combo - 1) * level : 0)

export const coinsFor = (stars: number, level: Level) => (stars ? stars * 10 + level * 5 : 2)

export const DAILY_COINS = 50
export const DAILY_LEVEL: Level = 3

export type ChestPrize = { kind: 'coins'; amount: number } | { kind: 'weapon'; weapon: Special }

export function openChest(rng: () => number = Math.random): ChestPrize {
  if (rng() < 0.35) {
    const weapons: Special[] = ['nuke', 'mg', 'b52']
    return { kind: 'weapon', weapon: weapons[Math.floor(rng() * weapons.length)] }
  }
  return { kind: 'coins', amount: 20 + Math.floor(rng() * 5) * 10 }
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function previousDay(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d - 1))
}

/** The streak after winning today's challenge; a second win on the same day changes nothing. */
export function dailyAfterWin(daily: Progress['daily'], today: string): Progress['daily'] {
  if (daily.last === today) return daily
  const streak = daily.last === previousDay(today) ? daily.streak + 1 : 1
  return { last: today, streak, best: Math.max(daily.best, streak) }
}

/** The streak shown today: broken if yesterday's challenge was missed. */
export const liveStreak = (daily: Progress['daily'], today: string) =>
  daily.last === today || daily.last === previousDay(today) ? daily.streak : 0

/** Same numbers for everyone on the same day, so the daily fleet is the same puzzle for all. */
export function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface BattleResult {
  won: boolean
  accuracy: number
  level: Level
  bestCombo: number
  shipsLost: number
  daily: boolean
}

/** Badges newly earned by a finished battle. */
export function earnedBadges(p: Progress, r: BattleResult): string[] {
  const got: string[] = []
  const add = (id: string, ok: boolean) => ok && !p.badges.includes(id) && got.push(id)
  add('first-win', r.won)
  add('sharpshooter', r.won && r.accuracy >= 0.6)
  add('untouchable', r.won && r.shipsLost === 0)
  add('combo-4', r.bestCombo >= 4)
  add('admiral', r.won && !r.daily && r.level === 5)
  add('daily-3', p.daily.streak >= 3)
  add('collector', p.owned.length >= 4)
  return got
}

/** Applies a finished battle: best stars, coins, daily streak and new badges. */
export function recordBattle(p: Progress, r: BattleResult, today: string): { progress: Progress; stars: number; coins: number; badges: string[] } {
  const stars = starsFor(r.won, r.accuracy)
  const firstDaily = r.daily && r.won && p.daily.last !== today
  const coins = r.daily ? (firstDaily ? DAILY_COINS : 0) : coinsFor(stars, r.level)
  let next: Progress = { ...p, coins: p.coins + coins }
  if (!r.daily && stars > (p.stars[r.level] ?? 0)) next.stars = { ...p.stars, [r.level]: stars }
  if (r.daily && r.won) next.daily = dailyAfterWin(p.daily, today)
  const badges = earnedBadges(next, r)
  if (badges.length) next = { ...next, badges: [...next.badges, ...badges] }
  return { progress: next, stars, coins, badges }
}

export function buySkin(p: Progress, id: string): Progress {
  const skin = SKINS.find((s) => s.id === id)
  if (!skin) return p
  if (p.owned.includes(id)) return { ...p, [skin.kind]: id }
  if (p.coins < skin.price) return p
  const next = { ...p, coins: p.coins - skin.price, owned: [...p.owned, id], [skin.kind]: id }
  return earnedBadges(next, { won: false, accuracy: 0, level: 1, bestCombo: 0, shipsLost: 0, daily: false }).includes('collector')
    ? { ...next, badges: [...next.badges, 'collector'] }
    : next
}

const KEY = 'battleship-progress'

export function loadProgress(): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Progress> | null
    return saved ? { ...NEW_PROGRESS, ...saved, daily: { ...NEW_PROGRESS.daily, ...saved.daily } } : NEW_PROGRESS
  } catch {
    return NEW_PROGRESS
  }
}

export const saveProgress = (p: Progress) => localStorage.setItem(KEY, JSON.stringify(p))
