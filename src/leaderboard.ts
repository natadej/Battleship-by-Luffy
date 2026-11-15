import type { Level } from './game/ai'

/** Leaderboard kept in this browser's localStorage (one ranking per device). */
export interface ScoreEntry {
  name: string
  score: number
  accuracy: number
  level: Level
  shots: number
  won: boolean
  assisted: boolean
  created_at?: string
}

export const TOP_N = 20
const SCORES_KEY = 'battleship-leaderboard'
const NAME_KEY = 'battleship-name'

const byRank = (a: ScoreEntry, b: ScoreEntry) => b.score - a.score || b.accuracy - a.accuracy

export function loadScores(): ScoreEntry[] {
  try {
    const all = JSON.parse(localStorage.getItem(SCORES_KEY) ?? '[]') as ScoreEntry[]
    return all.sort(byRank).slice(0, TOP_N)
  } catch {
    return []
  }
}

export function submitScore(entry: ScoreEntry): ScoreEntry {
  const saved = { ...entry, created_at: new Date().toISOString() }
  const next = [...loadScores(), saved].sort(byRank).slice(0, TOP_N)
  localStorage.setItem(SCORES_KEY, JSON.stringify(next))
  return saved
}

export const savedName = () => localStorage.getItem(NAME_KEY) ?? ''
export const saveName = (name: string) => localStorage.setItem(NAME_KEY, name)
