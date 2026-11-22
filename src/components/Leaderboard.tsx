import { useEffect, useState } from 'react'
import { tierOf } from '../game/fleet'
import { LEVELS } from '../game/ai'
import { pct } from '../game/score'
import { type ScoreEntry, fetchGlobal, flushPending, hasGlobal, loadScores, pendingUploads } from '../leaderboard'

export function LeaderboardTable({ highlight, rows = loadScores(), mine = [] }: { highlight?: ScoreEntry | null; rows?: ScoreEntry[]; mine?: string[] }) {
  if (!rows.length) return <p className="lb-note">No scores yet. Finish a battle to claim rank #1.</p>
  return (
    <table className="lb-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Mission</th>
          <th>Accuracy</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const isMine = (highlight && (highlight.id ? highlight.id === r.id : highlight.created_at === r.created_at)) || (!!r.id && mine.includes(r.id))
          return (
            <tr key={`${r.id ?? r.created_at}-${i}`} className={isMine ? 'mine' : ''}>
              <td>{i + 1}</td>
              <td>
                {isMine && <span title="Your score">▶ </span>}
                {r.name}
                {r.won && <span title="Won the battle"> ★</span>}
                {r.assisted && <span title="Used the probability shade (score halved)"> ◐</span>}
              </td>
              <td title={LEVELS[tierOf(r.level) - 1].strategy}>
                {r.level} · {LEVELS[tierOf(r.level) - 1].name}
              </td>
              <td>{pct(r.accuracy)}</td>
              <td>{r.score}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

type Tab = 'global' | 'device'
type Global = { status: 'loading' } | { status: 'ok'; rows: ScoreEntry[] } | { status: 'offline' }

export function LeaderboardDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(hasGlobal() ? 'global' : 'device')
  const [global, setGlobal] = useState<Global>({ status: 'loading' })
  const [waiting, setWaiting] = useState(() => pendingUploads().length)
  const mine = loadScores().flatMap((e) => (e.id ? [e.id] : []))

  useEffect(() => {
    if (!hasGlobal()) return
    let live = true
    flushPending()
      .catch(() => 0)
      .then(() => fetchGlobal())
      .then((rows) => live && setGlobal({ status: 'ok', rows }))
      .catch(() => live && setGlobal({ status: 'offline' }))
      .finally(() => live && setWaiting(pendingUploads().length))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Leaderboard" onClick={(e) => e.stopPropagation()}>
        <h2>
          Leaderboard
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </h2>
        {hasGlobal() && (
          <div className="lb-tabs" role="tablist">
          {(['global', 'device'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'global' ? '🌍 Global' : '📱 This device'}
            </button>
          ))}
          </div>
        )}
        {tab === 'device' ? (
          <LeaderboardTable />
        ) : global.status === 'ok' ? (
          <LeaderboardTable rows={global.rows} mine={mine} />
        ) : (
          <p className="lb-note">{global.status === 'loading' ? 'Loading world scores…' : 'Offline: connect to the internet to see world scores.'}</p>
        )}
        <p className="lb-note">
          Ranked by score, then accuracy.{' '}
          {tab === 'global' ? 'Players everywhere; ▶ marks your scores.' : 'Saved in this browser.'}
          {waiting > 0 && ` ${waiting} score${waiting > 1 ? 's' : ''} waiting to upload when you're online.`}
        </p>
      </div>
    </div>
  )
}
