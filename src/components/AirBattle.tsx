import { useEffect, useRef } from 'react'
import { AirShow } from '../airshow'

/** Full-screen canvas for the air battle; hands its controller to the parent while mounted. */
export function AirBattle({ register }: { register: (show: AirShow | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!canvas.current) return
    const show = new AirShow(canvas.current)
    register(show)
    return () => {
      register(null)
      show.destroy()
    }
  }, [register])
  return <canvas ref={canvas} className="air-layer" aria-hidden="true" />
}
