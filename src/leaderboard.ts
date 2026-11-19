import type { Level } from './game/ai'

/**
 * Scores are kept in this browser's localStorage (works offline) and uploaded to the
 * global leaderboard API. Uploads that fail (offline, server down) wait in a queue
 * and are retried on the next start or when the device comes back online.
 */
export interface ScoreEntry {
  id?: string
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
/** Global leaderboard API, set at build time. Without it the game keeps scores on the device only. */
const apiUrl = (): string => String(import.meta.env.VITE_LEADERBOARD_URL ?? '').replace(/\/+$/, '')
export const hasGlobal = () => apiUrl() !== ''
const SCORES_KEY = 'battleship-leaderboard'
const PENDING_KEY = 'battleship-pending-uploads'
const NAME_KEY = 'battleship-name'

const byRank = (a: ScoreEntry, b: ScoreEntry) => b.score - a.score || b.accuracy - a.accuracy

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

export function loadScores(): ScoreEntry[] {
  const all = read<ScoreEntry[]>(SCORES_KEY, [])
  return Array.isArray(all) ? all.sort(byRank).slice(0, TOP_N) : []
}

export const pendingUploads = (): ScoreEntry[] => {
  const all = read<ScoreEntry[]>(PENDING_KEY, [])
  return Array.isArray(all) ? all : []
}

export function submitScore(entry: ScoreEntry): ScoreEntry {
  const saved = { ...entry, id: newId(), created_at: new Date().toISOString() }
  const next = [...loadScores(), saved].sort(byRank).slice(0, TOP_N)
  localStorage.setItem(SCORES_KEY, JSON.stringify(next))
  if (hasGlobal()) {
    localStorage.setItem(PENDING_KEY, JSON.stringify([...pendingUploads(), saved]))
    void flushPending()
  }
  return saved
}

let flushing: Promise<number> | null = null

/** Uploads queued scores; returns how many were accepted. Stops at the first network/server error. */
export function flushPending(fetchFn: typeof fetch = fetch): Promise<number> {
  if (!hasGlobal()) return Promise.resolve(0)
  // `.finally` always runs after this assignment, even when the queue is empty.
  flushing ??= uploadQueue(fetchFn).finally(() => {
    flushing = null
  })
  return flushing
}

async function uploadQueue(fetchFn: typeof fetch): Promise<number> {
  let sent = 0
  try {
    for (const entry of pendingUploads()) {
      const res = await fetchFn(`${apiUrl()}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
      // Retry later on rate limits and server errors; drop entries the server rejects as invalid.
      if (res.status === 429 || res.status >= 500) break
      localStorage.setItem(PENDING_KEY, JSON.stringify(pendingUploads().filter((e) => e.id !== entry.id)))
      if (res.ok) sent++
    }
  } catch {
    // Offline: keep the queue for next time.
  }
  return sent
}

export async function fetchGlobal(limit = TOP_N, fetchFn: typeof fetch = fetch): Promise<ScoreEntry[]> {
  if (!hasGlobal()) throw new Error('global leaderboard not configured')
  const res = await fetchFn(`${apiUrl()}/scores?limit=${limit}`)
  if (!res.ok) throw new Error(`leaderboard ${res.status}`)
  const { scores } = (await res.json()) as { scores: ScoreEntry[] }
  return scores
}

export const savedName = () => localStorage.getItem(NAME_KEY) ?? ''
export const saveName = (name: string) => localStorage.setItem(NAME_KEY, name)
