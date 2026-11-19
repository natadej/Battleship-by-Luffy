import { describe, expect, it } from 'vitest'
import { MAX_SCORE, cleanName, validate } from './validate'

const good = { id: '0b6f1c3e-2a4d-4e8f-9a1b-123456789abc', name: 'Luffy', score: 4200, accuracy: 0.55, level: 3, shots: 80, won: false, assisted: false }

describe('validate', () => {
  it('accepts a normal campaign score', () => {
    expect(validate(good)).toEqual(good)
  })

  it('cleans names', () => {
    expect(cleanName('  Captain\n  <b>Luffy</b>  ')).toBe('Captain bLuffy/b')
    expect(cleanName('x'.repeat(40))).toHaveLength(20)
    expect(cleanName('   ')).toBeNull()
    expect(cleanName(7)).toBeNull()
  })

  it.each([
    [{ ...good, score: MAX_SCORE + 1 }, 'bad score'],
    [{ ...good, score: 1.5 }, 'bad score'],
    [{ ...good, accuracy: 1.2 }, 'bad accuracy'],
    [{ ...good, level: 6 }, 'bad level'],
    [{ ...good, shots: -1 }, 'bad shots'],
    [{ ...good, won: 'yes' }, 'bad flags'],
    [{ ...good, id: 'x; DROP TABLE' }, 'bad id'],
    [{ ...good, name: '' }, 'bad name'],
    [null, 'body must be a JSON object'],
  ])('rejects %o', (body, reason) => {
    expect(validate(body)).toBe(reason)
  })
})
