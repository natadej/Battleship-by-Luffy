import { useLayoutEffect, useRef } from 'react'
import { type Battery, placeCannon } from '../artillery'

/** Start on the edges facing each other (player upper right, enemy lower left) so they don't overlap. */
const HOME = { player: { pos: 0.3, angle: 0 }, enemy: { pos: 0.8, angle: 180 } }

export function Cannon({ side, register }: { side: 'player' | 'enemy'; register: (b: Battery | null) => void }) {
  const cannon = useRef<HTMLDivElement>(null)
  const turret = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const track = cannon.current?.parentElement
    if (!cannon.current || !turret.current || !track) return
    const battery = { cannon: cannon.current, turret: turret.current, track }
    placeCannon(battery, HOME[side].pos, HOME[side].angle)
    register(battery)
    return () => register(null)
  }, [side, register])

  return (
    <div ref={cannon} className={`cannon cannon-${side}`} aria-hidden="true">
      <div className="cannon-base" />
      <div ref={turret} className="cannon-turret">
        <span className="cannon-barrel" />
        <span className="cannon-flash" />
      </div>
    </div>
  )
}
