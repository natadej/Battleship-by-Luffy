import { useEffect } from 'react'
import { LEVELS } from '../game/ai'
import { pct } from '../game/score'
import { type ScoreEntry, loadScores } from '../leaderboard'

export function LeaderboardTable({ highlight }: { highlight?: ScoreEntry | null }) {
  const rows = loadScores()
  if (!rows.length) return <p className="lb-note">No scores yet. Finish a battle to claim rank #1.</p>
  return (
    <table className="lb-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Level</th>
          <th>Accuracy</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const mine = highlight?.created_at === r.created_at
          return (
            <tr key={`${r.created_at}-${i}`} className={mine ? 'mine' : ''}>
              <td>{i + 1}</td>
              <td>
                {r.name}
                {r.won && <span title="Won the battle"> ★</span>}
                {r.assisted && <span title="Used the probability shade (score halved)"> ◐</span>}
              </td>
              <td title={LEVELS[r.level - 1]?.strategy}>
                {r.level} · {LEVELS[r.level - 1]?.name}
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

export function LeaderboardDialog({ onClose }: { onClose: () => void }) {
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
        <LeaderboardTable />
        <p className="lb-note">
          Ranked by score, then accuracy. Saved in this browser.
        </p>
      </div>
    </div>
  )
}
