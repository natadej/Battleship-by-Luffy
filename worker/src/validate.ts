export interface Entry {
  id: string
  name: string
  score: number
  accuracy: number
  level: number
  shots: number
  won: boolean
  assisted: boolean
}

/** Best possible campaign: 100% accuracy, a win and a 17-hit combo on every level 1–5. */
/**
 * Campaign ceiling with headroom. Per level L the most is 1500·L for a perfect win plus a combo of every hit:
 * 17 ship squares + 5 more if a healed ship moves = 22 hits → 50·L·(1+…+21) = 11 550·L.
 * Summed over levels 1–5: 13 050 × 15 = 195 750.
 */
export const MAX_SCORE = 250_000
export const MAX_SHOTS = 1000
const ID = /^[0-9a-z-]{8,40}$/i

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // oxlint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20)
  return name || null
}

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max

/** Returns the cleaned entry, or a reason it was rejected. */
export function validate(body: unknown): Entry | string {
  if (!body || typeof body !== 'object') return 'body must be a JSON object'
  const b = body as Record<string, unknown>
  if (typeof b.id !== 'string' || !ID.test(b.id)) return 'bad id'
  const name = cleanName(b.name)
  if (!name) return 'bad name'
  if (!isInt(b.score, 0, MAX_SCORE)) return 'bad score'
  if (typeof b.accuracy !== 'number' || !(b.accuracy >= 0 && b.accuracy <= 1)) return 'bad accuracy'
  if (!isInt(b.level, 1, 5)) return 'bad level'
  if (!isInt(b.shots, 0, MAX_SHOTS)) return 'bad shots'
  if (typeof b.won !== 'boolean' || typeof b.assisted !== 'boolean') return 'bad flags'
  return { id: b.id, name, score: b.score, accuracy: b.accuracy, level: b.level, shots: b.shots, won: b.won, assisted: b.assisted }
}
