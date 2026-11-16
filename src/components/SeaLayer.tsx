import { useEffect, useRef } from 'react'
import { SeaBubbles } from '../sea'

/** Full-screen canvas of bubbles rising on both boards. */
export function SeaLayer() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!canvas.current) return
    const sea = new SeaBubbles(canvas.current)
    return () => sea.destroy()
  }, [])
  return <canvas ref={canvas} className="sea-layer" aria-hidden="true" />
}
