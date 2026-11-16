import { type CSSProperties, useState } from 'react'

const SPARKS = [0, 60, 120, 180, 240, 300]
const DROPS = [-40, -15, 10, 35]
const HIT_WORDS = ['BOOM!', 'POW!', 'KABOOM!', 'BAM!']
const MISS_WORDS = ['SPLASH!', 'SPLOOSH!', 'PLOP!']

/** One-shot animation played in a cell when a rocket lands: an explosion on a hit, a splash on a miss. */
export function ShotFx({ hit }: { hit: boolean }) {
  const words = hit ? HIT_WORDS : MISS_WORDS
  const [word] = useState(() => words[Math.floor(Math.random() * words.length)])
  return (
    <span className={`fx ${hit ? 'fx-hit' : 'fx-miss'}`} aria-hidden="true">
      <span className="fx-word">{word}</span>
      {hit ? (
        <>
          <span className="fx-flash" />
          <span className="fx-ring" />
          {SPARKS.map((deg) => (
            <span key={deg} className="fx-spark" style={{ '--a': `${deg}deg` } as CSSProperties} />
          ))}
        </>
      ) : (
        <>
          <span className="fx-ripple" />
          <span className="fx-ripple fx-ripple-2" />
          {DROPS.map((dx) => (
            <span key={dx} className="fx-drop" style={{ '--dx': `${dx}%` } as CSSProperties} />
          ))}
        </>
      )}
    </span>
  )
}
