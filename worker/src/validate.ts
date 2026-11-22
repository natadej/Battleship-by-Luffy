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

/**
 * Missions never end, so the caps grow with the mission reached (stored as `level`). Per mission M the most is
 * 1500·M for a perfect win plus a combo of every hit: 17 ship squares + 5 if a healed ship moves + up to 15 armour
 * dents = 37 hits → 50·M·(1+…+36) = 33 300·M. That's 34 800·M per mission; 40 000 leaves headroom.
 */
export const MAX_MISSION = 10_000
export const maxScore = (mission: number) => (40_000 * mission * (mission + 1)) / 2
/** At most 100 squares plus 15 armour dents per battle. */
export const maxShots = (mission: number) => 120 * mission
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
  if (typeof b.accuracy !== 'number' || !(b.accuracy >= 0 && b.accuracy <= 1)) return 'bad accuracy'
  if (!isInt(b.level, 1, MAX_MISSION)) return 'bad level'
  if (!isInt(b.score, 0, maxScore(b.level as number))) return 'bad score'
  if (!isInt(b.shots, 0, maxShots(b.level as number))) return 'bad shots'
  if (typeof b.won !== 'boolean' || typeof b.assisted !== 'boolean') return 'bad flags'
  return { id: b.id, name, score: b.score, accuracy: b.accuracy, level: b.level, shots: b.shots, won: b.won, assisted: b.assisted }
}
