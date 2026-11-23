import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { playBoop } from '../sound'
import { hush, say } from '../voice'

export interface GuideStep {
  /** CSS selector of the thing to point at; none for a centred card. */
  target?: string
  icon: string
  title: string
  text: string
}

type Box = { top: number; left: number; width: number; height: number }

/** A first-time tour: dims the screen, rings one thing at a time and explains it out loud. */
export function Guide({ steps, onDone }: { steps: GuideStep[]; onDone: () => void }) {
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const step = steps[i]
  const last = i === steps.length - 1

  useLayoutEffect(() => {
    const measure = () => {
      const el = step.target ? document.querySelector(step.target) : null
      const r = el?.getBoundingClientRect()
      setBox(r && r.width ? { top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 } : null)
    }
    measure()
    window.addEventListener('resize', measure)
    const t = setInterval(measure, 500)
    return () => {
      window.removeEventListener('resize', measure)
      clearInterval(t)
    }
  }, [step])

  useEffect(() => {
    playBoop()
    const t = setTimeout(() => say(`${step.title}. ${step.text}`, true), 250)
    return () => clearTimeout(t)
  }, [step])

  useEffect(() => hush, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  const below = !box || box.top + box.height / 2 < window.innerHeight / 2
  const cardStyle = !box
    ? undefined
    : below
      ? { top: Math.min(box.top + box.height + 10, window.innerHeight - 150) }
      : { bottom: Math.min(window.innerHeight - box.top + 10, window.innerHeight - 150) }

  return createPortal(
    <div className="guide" role="dialog" aria-modal="true" aria-label="How to play">
      {box ? <div className="guide-ring" style={box} /> : <div className="guide-dim" />}
      <div className={`guide-card ${box ? '' : 'centre'}`} style={cardStyle} aria-live="polite">
        <span className="guide-icon" aria-hidden="true">
          {step.icon}
        </span>
        <div>
          <b>{step.title}</b>
          <p>{step.text}</p>
        </div>
        <div className="guide-actions">
          <span className="guide-count">
            {i + 1}/{steps.length}
          </span>
          {!last && (
            <button type="button" className="guide-skip" onClick={onDone}>
              Skip
            </button>
          )}
          <button type="button" className="guide-next" autoFocus onClick={() => (last ? onDone() : setI(i + 1))}>
            {last ? "Let's go! ⚓" : 'Next ▶'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
