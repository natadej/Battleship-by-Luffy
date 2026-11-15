import { beforeEach, describe, expect, it } from 'vitest'
import { type ScoreEntry, TOP_N, loadScores, submitScore } from './leaderboard'

const entry = (score: number, accuracy = 0.5): ScoreEntry => ({ name: `p${score}`, score, accuracy, level: 3, shots: 40, won: true, assisted: false })

describe('leaderboard', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as Storage
  })

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
})
