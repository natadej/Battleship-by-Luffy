import { describe, expect, it } from 'vitest'
import { largestFitting } from './fit'

describe('largestFitting', () => {
  it('finds the biggest size that fits', () => {
    for (const limit of [14, 15, 37, 71, 72]) expect(largestFitting(14, 72, (n) => n <= limit)).toBe(limit)
  })

  it('falls back to the smallest size when nothing fits', () => {
    expect(largestFitting(14, 72, () => false)).toBe(14)
  })
})
