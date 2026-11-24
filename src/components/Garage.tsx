import { useEffect, useRef, useState } from 'react'
import { useFitZoom } from '../fit'
import { FLEET } from '../game/board'
import { SHIP_SPECIAL, perksOf } from '../game/fleet'
import { blockCost, repairCost, shipName, shipRecord } from '../game/garage'
import type { Progress } from '../game/rewards'
import { WEAPON_INFO } from '../game/weapons'
import { ShipSprite } from './ShipSprite'

/** What the next level adds, in words: always a plaque, a special from Lv 2, armour at Lv 3 and Lv 6. */
function nextPerk(id: string, level: number) {
  const now = perksOf(level)
  const next = perksOf(level + 1)
  const extras = [`a "Lv ${level + 1}" plaque`]
  if (next.special > now.special) extras.push(`+1 ${WEAPON_INFO[SHIP_SPECIAL[id]].name} every battle`)
  if (next.armour > now.armour) extras.push('🛡 an armoured block that takes 2 hits')
  return extras.join(', ')
}

interface Props {
  progress: Progress
  onUpgrade: (id: string, block: number) => void
  onRepair: (id: string) => void
  onRename: (id: string, name: string) => void
  onClose: () => void
}

/** Your own fleet between battles: repair ships sunk last time, and upgrade them block by block. */
export function GarageDialog({ progress, onUpgrade, onRepair, onRename, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [id, setId] = useState(() => progress.wrecks[0] ?? FLEET[0].id)
  const [spent, setSpent] = useState<{ key: number; text: string } | null>(null)
  const spend = (text: string) => setSpent((s) => ({ key: (s?.key ?? 0) + 1, text }))
  useFitZoom(box, progress)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const def = FLEET.find((s) => s.id === id)!
  const rec = shipRecord(progress.garage, id)
  const cost = blockCost(rec.level)
  const wreck = progress.wrecks.includes(id)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={box} className="modal garage" role="dialog" aria-label="Garage" onClick={(e) => e.stopPropagation()}>
        <h2>
          🔧 Garage
          <span className="garage-wallet" aria-live="polite">
            <span key={`c${progress.coins}`} className="wallet-coins" title="Coins: repair ships">
              🪙 {progress.coins}
            </span>
            <span key={`p${progress.parts}`} className="wallet-parts" title="Parts: upgrade blocks">
              🔩 {progress.parts}
            </span>
            {spent && (
              <span key={spent.key} className="wallet-spent">
                {spent.text}
              </span>
            )}
          </span>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </h2>
        <div className="garage-ships" role="tablist" aria-label="Your ships">
          {FLEET.map((s) => {
            const r = shipRecord(progress.garage, s.id)
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === id}
                className={`garage-tab ${s.id === id ? 'on' : ''} ${progress.wrecks.includes(s.id) ? 'wreck' : ''}`}
                onClick={() => setId(s.id)}
              >
                <b>{shipName(progress.garage, s.id)}</b>
                <span>
                  Lv {r.level} · {progress.wrecks.includes(s.id) ? '💥 wreck' : `${r.blocks.length}/${s.length} 🔩`}
                </span>
              </button>
            )
          })}
        </div>
        <div className={`garage-bay ${wreck ? 'wreck' : ''}`} style={{ '--len': def.length } as React.CSSProperties}>
          <div className="garage-ship ship-sprite">
            <ShipSprite id={id} length={def.length} orientation="H" sunk={wreck} level={rec.level} />
          </div>
          <div className="garage-blocks">
            {Array.from({ length: def.length }, (_, b) => {
              const done = rec.blocks.includes(b)
              return (
                <button
                  key={b}
                  type="button"
                  className={`garage-block ${done ? 'done' : ''}`}
                  aria-label={`Block ${b + 1}${done ? ', upgraded' : `, upgrade for ${cost} parts`}`}
                  disabled={wreck || done || progress.parts < cost}
                  onClick={() => {
                    onUpgrade(id, b)
                    spend(`−${cost} 🔩`)
                  }}
                >
                  {done ? '🔩' : '+'}
                </button>
              )
            })}
          </div>
        </div>
        {wreck ? (
          <p className="garage-note">
            💥 Sunk in your last battle. Until it's repaired it fights at Lv 1 and can't be upgraded.{' '}
            <button
              type="button"
              className="primary repair-btn"
              disabled={progress.coins < repairCost(def.length)}
              onClick={() => {
                onRepair(id)
                spend(`−${repairCost(def.length)} 🪙`)
              }}
            >
              🔧 Repair: {repairCost(def.length)} 🪙
            </button>
            <span className="repair-math">
              You have {progress.coins} 🪙
              {progress.coins >= repairCost(def.length) ? `, ${progress.coins - repairCost(def.length)} 🪙 left after.` : `: ${repairCost(def.length) - progress.coins} 🪙 short. Win missions for more.`}
            </span>
          </p>
        ) : (
          <p className="garage-note">
            Tap a block to upgrade it for 🔩 {cost}. Upgrade all {def.length} to reach Lv {rec.level + 1}: {nextPerk(id, rec.level)}.
            {progress.parts < cost && ' Win missions to earn more parts.'}
          </p>
        )}
        <label className="garage-name">
          Name
          <input
            key={id}
            defaultValue={rec.name ?? ''}
            maxLength={14}
            placeholder={def.name}
            onBlur={(e) => onRename(id, e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
      </div>
    </div>
  )
}
