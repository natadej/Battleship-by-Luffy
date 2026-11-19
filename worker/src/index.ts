import { validate } from './validate'

interface D1Result<T> {
  results: T[]
}
interface D1Statement {
  bind(...values: unknown[]): D1Statement
  first<T>(): Promise<T | null>
  all<T>(): Promise<D1Result<T>>
  run(): Promise<{ meta: { changes: number } }>
}
interface Env {
  DB: { prepare(sql: string): D1Statement }
  ALLOWED_ORIGINS: string
}

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
const POSTS_PER_MINUTE = 6

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const ok = env.ALLOWED_ORIGINS.split(',').includes(origin) || LOCAL.test(origin)
  return {
    'Access-Control-Allow-Origin': ok ? origin : env.ALLOWED_ORIGINS.split(',')[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

const json = (data: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } })

async function ipHash(req: Request): Promise<string> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`battleship:${ip}`))
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const headers = cors(req, env)
    const { pathname, searchParams } = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (pathname !== '/scores') return json({ error: 'not found' }, 404, headers)

    if (req.method === 'GET') {
      const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 20, 1), 50)
      const { results } = await env.DB.prepare(
        'SELECT id, name, score, accuracy, level, shots, won, assisted, created_at FROM scores ORDER BY score DESC, accuracy DESC, created_at ASC LIMIT ?',
      )
        .bind(limit)
        .all<Record<string, unknown>>()
      const scores = results.map((r) => ({ ...r, won: r.won === 1, assisted: r.assisted === 1 }))
      return json({ scores }, 200, { ...headers, 'Cache-Control': 'public, max-age=15' })
    }

    if (req.method === 'POST') {
      if (Number(req.headers.get('Content-Length') ?? 0) > 2000) return json({ error: 'too large' }, 413, headers)
      let body: unknown
      try {
        body = await req.json()
      } catch {
        return json({ error: 'invalid JSON' }, 400, headers)
      }
      const entry = validate(body)
      if (typeof entry === 'string') return json({ error: entry }, 400, headers)
      const ip = await ipHash(req)
      // One statement, so concurrent posts can't all pass the rate check before inserting.
      const { meta } = await env.DB.prepare(
        `INSERT OR IGNORE INTO scores (id, name, score, accuracy, level, shots, won, assisted, ip_hash)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE (SELECT COUNT(*) FROM scores WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')) < ?`,
      )
        .bind(entry.id, entry.name, entry.score, entry.accuracy, entry.level, entry.shots, entry.won ? 1 : 0, entry.assisted ? 1 : 0, ip, ip, POSTS_PER_MINUTE)
        .run()
      // Same order as GET: score, then accuracy, then earliest first. A retried id ranks its original row.
      const rank = await env.DB.prepare(
        `SELECT COUNT(s.id) + 1 AS rank, MAX(me.id) AS found
         FROM (SELECT score, accuracy, created_at, id FROM scores WHERE id = ?) me
         LEFT JOIN scores s ON s.score > me.score
           OR (s.score = me.score AND (s.accuracy > me.accuracy OR (s.accuracy = me.accuracy AND s.created_at < me.created_at)))`,
      )
        .bind(entry.id)
        .first<{ rank: number; found: string | null }>()
      if (meta.changes === 0 && !rank?.found) return json({ error: 'slow down' }, 429, headers)
      return json({ ok: true, rank: rank?.rank ?? null }, 201, headers)
    }

    return json({ error: 'method not allowed' }, 405, headers)
  },
}
