import { useEffect } from 'react'
import { LEVELS, type Level } from '../game/ai'
import { BADGES, type Progress, SKINS, liveStreak, starRow } from '../game/rewards'

/** A path of islands from level 1 to 5: past levels show their best stars, the current one bobs. */
export function LevelMap({ level, stars, daily }: { level: Level; stars: Progress['stars']; daily: boolean }) {
  return (
    <ol className={`level-map ${daily ? 'dimmed' : ''}`} aria-label="Level map">
      {LEVELS.map((l) => {
        const state = l.level < level ? 'done' : l.level === level ? 'here' : 'locked'
        return (
          <li key={l.level} className={`island island-${state}`} title={`Level ${l.level}: ${l.name}`}>
            <span className="island-icon" aria-hidden="true">
              {state === 'locked' ? '🔒' : state === 'here' ? '⛵' : '🏝️'}
            </span>
            <b>{l.level}</b>
            <span className="island-stars" aria-label={`${stars[l.level] ?? 0} of 3 stars`}>
              {starRow(stars[l.level] ?? 0)}
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
  const totalStars = Object.values(progress.stars).reduce((a, b) => a + (b ?? 0), 0)
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
          <span>⭐ {totalStars} / 15 stars</span>
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
