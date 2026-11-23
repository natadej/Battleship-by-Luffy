import { describe, expect, it } from 'vitest'
import { SONGS, noteFreq, parseLine } from './music'

describe('music', () => {
  it('turns note names into frequencies', () => {
    expect(noteFreq('A4')).toBe(440)
    expect(noteFreq('A5')).toBe(880)
    expect(noteFreq('C4')).toBeCloseTo(261.63, 1)
    expect(noteFreq('-')).toBeNull()
  })

  it('has only valid tokens in both themes, and holds lengthen notes', () => {
    for (const song of Object.values(SONGS))
      for (const line of [song.lead, song.bass])
        for (const t of line.trim().split(/\s+/)) expect(t === '-' || t === '~' || noteFreq(t) !== null).toBe(true)
    expect(parseLine('C5 ~ ~ - D5')[0]).toMatchObject({ steps: 3 })
  })

  it('keeps every part in whole bars of 16 steps, so the march stays in time when it loops', () => {
    for (const song of Object.values(SONGS)) {
      for (const line of [song.lead, song.bass]) expect(line.trim().split(/\s+/).length % 16).toBe(0)
      expect(song.drums.length % 16).toBe(0)
      expect(song.drums).toMatch(/^[ksrth-]+$/)
    }
  })
})
