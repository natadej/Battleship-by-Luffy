import { useEffect } from 'react'
import { LEVELS } from '../game/ai'
import { isBoss, tierOf } from '../game/fleet'
import { BADGES, type Progress, SKINS, liveStreak, starRow } from '../game/rewards'

/** A window of islands around the current mission (missions never end): past ones show their best stars, bosses a 👹. */
export function LevelMap({ mission, stars, daily }: { mission: number; stars: Progress['stars']; daily: boolean }) {
  const first = Math.max(1, mission - 2)
  return (
    <ol className={`level-map ${daily ? 'dimmed' : ''}`} aria-label="Mission map">
      {Array.from({ length: 5 }, (_, k) => first + k).map((m) => {
        const state = m < mission ? 'done' : m === mission ? 'here' : 'locked'
        const boss = isBoss(m)
        return (
          <li key={m} className={`island island-${state}${boss ? ' island-boss' : ''}`} title={`Mission ${m}${boss ? ' (boss)' : ''}: ${LEVELS[tierOf(m) - 1].name}`}>
            <span className="island-icon" aria-hidden="true">
              {state === 'here' ? '⛵' : boss ? '👹' : state === 'locked' ? '🔒' : '🏝️'}
            </span>
            <b>{m}</b>
            <span className="island-stars" aria-label={`${stars[m] ?? 0} of 3 stars`}>
              {starRow(stars[m] ?? 0)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function RewardsDialog({ progress, today, onBuy, onClose }: { progress: Progress; today: string; onBuy: (id: string) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const totalStars = Object.values(progress.stars).reduce<number>((a, b) => a + (b ?? 0), 0)
  const skins = (kind: 'ship' | 'sea') =>
    SKINS.filter((s) => s.kind === kind).map((s) => {
      const owned = progress.owned.includes(s.id)
      const on = progress[kind] === s.id
      return (
        <button
          key={s.id}
          type="button"
          className={`skin skin-${s.id} ${on ? 'on' : ''}`}
          aria-pressed={on}
          disabled={!owned && progress.coins < s.price}
          onClick={() => onBuy(s.id)}
        >
          <span className="skin-swatch" aria-hidden="true">
            {s.icon}
          </span>
          <span>{s.name}</span>
          <small>{on ? 'Using' : owned ? 'Use' : `🪙 ${s.price}`}</small>
        </button>
      )
    })
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rewards" role="dialog" aria-label="Rewards" onClick={(e) => e.stopPropagation()}>
        <h2>
          🎒 Rewards
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </h2>
        <p className="reward-totals">
          <span>🪙 {progress.coins} coins</span>
          <span>⭐ {totalStars} stars</span>
          <span>📅 {liveStreak(progress.daily, today)} day streak (best {progress.daily.best})</span>
        </p>
        <h3>Badges</h3>
        <ul className="badge-grid">
          {BADGES.map((b) => {
            const got = progress.badges.includes(b.id)
            return (
              <li key={b.id} className={got ? 'got' : 'locked'} title={b.desc}>
                <span className="badge-icon" aria-hidden="true">
                  {b.icon}
                </span>
                <b>{b.name}</b>
                <small>{got ? 'Earned!' : b.desc}</small>
              </li>
            )
          })}
        </ul>
        <h3>Ship colours</h3>
        <div className="skin-grid">{skins('ship')}</div>
        <h3>Seas</h3>
        <div className="skin-grid">{skins('sea')}</div>
      </div>
    </div>
  )
}
