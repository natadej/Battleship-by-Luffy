import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ScoreEntry, TOP_N, fetchGlobal, flushPending, hasGlobal, loadScores, pendingUploads, submitScore } from './leaderboard'

const entry = (score: number, accuracy = 0.5): ScoreEntry => ({ name: `p${score}`, score, accuracy, level: 3, shots: 40, won: true, assisted: false })

describe('leaderboard', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as Storage
    // Keep submitScore's background upload away from the network.
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline'))) as typeof fetch
    vi.stubEnv('VITE_LEADERBOARD_URL', 'https://api.example.test/')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('ranks by score, then accuracy', () => {
    submitScore(entry(100, 0.4))
    submitScore(entry(300))
    submitScore(entry(100, 0.9))
    expect(loadScores().map((e) => [e.score, e.accuracy])).toEqual([
      [300, 0.5],
      [100, 0.9],
      [100, 0.4],
    ])
  })

  it(`keeps only the top ${TOP_N}`, () => {
    for (let i = 0; i < TOP_N + 5; i++) submitScore(entry(i))
    const scores = loadScores()
    expect(scores).toHaveLength(TOP_N)
    expect(scores.at(-1)?.score).toBe(5)
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('battleship-leaderboard', '{oops')
    expect(loadScores()).toEqual([])
  })

  it('queues scores and keeps them while offline', async () => {
    const saved = submitScore(entry(100))
    expect(saved.id).toBeTruthy()
    await flushPending(() => Promise.reject(new TypeError('offline')))
    expect(pendingUploads().map((e) => e.id)).toEqual([saved.id])
  })

  it('uploads queued scores once online and drops rejected ones', async () => {
    submitScore(entry(100))
    submitScore(entry(200))
    await flushPending(() => Promise.reject(new TypeError('offline')))
    const statuses = [201, 400]
    const send = vi.fn(() => Promise.resolve(new Response(null, { status: statuses.shift() })))
    expect(await flushPending(send as typeof fetch)).toBe(1)
    expect(send).toHaveBeenCalledTimes(2)
    expect(pendingUploads()).toEqual([])
  })

  it('retries later on rate limits and server errors', async () => {
    submitScore(entry(100))
    await flushPending(() => Promise.reject(new TypeError('offline')))
    await flushPending(() => Promise.resolve(new Response(null, { status: 429 })))
    await flushPending(() => Promise.resolve(new Response(null, { status: 503 })))
    expect(pendingUploads()).toHaveLength(1)
  })

  it('reads the global board', async () => {
    const rows = [{ ...entry(900), id: 'a' }]
    const get = vi.fn(() => Promise.resolve(Response.json({ scores: rows })))
    expect(await fetchGlobal(5, get as typeof fetch)).toEqual(rows)
    expect(get).toHaveBeenCalledWith('https://api.example.test/scores?limit=5')
  })

  it('keeps scores on the device only when no global API is set', async () => {
    vi.stubEnv('VITE_LEADERBOARD_URL', '')
    expect(hasGlobal()).toBe(false)
    submitScore(entry(100))
    expect(loadScores()).toHaveLength(1)
    expect(pendingUploads()).toEqual([])
    await expect(fetchGlobal()).rejects.toThrow()
  })

  it('still uploads after a flush with an empty queue', async () => {
    const send = vi.fn(() => Promise.resolve(new Response(null, { status: 201 })))
    expect(await flushPending(send as typeof fetch)).toBe(0)
    globalThis.fetch = send as typeof fetch
    submitScore(entry(100))
    await vi.waitFor(() => expect(pendingUploads()).toEqual([]))
    expect(send).toHaveBeenCalledTimes(1)
  })
})
