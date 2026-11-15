// Bubbles rising to the surface of both boards and popping, drawn on one full-screen canvas.

type BoardId = 'own' | 'enemy'
type Bubble = { x: number; y: number; t0: number; dur: number; r: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function gridRect(board: BoardId): DOMRect | null {
  return document.querySelector(`.grid[data-board="${board}"]`)?.getBoundingClientRect() ?? null
}

export class SeaBubbles {
  private ctx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private bubbles: Bubble[] = []
  private raf = 0
  private w = 0
  private h = 0
  private calm = matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
    addEventListener('resize', this.resize)
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    removeEventListener('resize', this.resize)
  }

  private resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    this.w = innerWidth
    this.h = innerHeight
    this.canvas.width = this.w * dpr
    this.canvas.height = this.h * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private frame = (ms: number) => {
    this.draw(ms / 1000)
    this.raf = requestAnimationFrame(this.frame)
  }

  private draw(t: number) {
    const { ctx } = this
    ctx.clearRect(0, 0, this.w, this.h)
    const scale = Math.min(1.15, Math.max(0.65, this.w / 1000))
    if (!this.calm && this.bubbles.length < 60)
      for (const board of ['own', 'enemy'] as BoardId[]) {
        const r = gridRect(board)
        if (r && Math.random() < 0.25)
          this.bubbles.push({ x: rand(r.left, r.right), y: rand(r.top, r.bottom), t0: t, dur: rand(1, 2.2), r: rand(1.2, 3.2) * scale })
      }
    this.bubbles = this.bubbles.filter((b) => t - b.t0 < b.dur)
    ctx.lineWidth = 1
    for (const b of this.bubbles) {
      const k = (t - b.t0) / b.dur
      const y = b.y - k * 8
      if (k < 0.85) {
        const r = b.r * (0.5 + k * 0.6)
        ctx.strokeStyle = `rgb(220 240 255 / ${0.55 * Math.min(1, k * 4)})`
        ctx.beginPath()
        ctx.arc(b.x, y, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = 'rgb(255 255 255 / 0.6)'
        ctx.fillRect(b.x - r * 0.45, y - r * 0.55, r * 0.35, r * 0.35)
      } else {
        const u = (k - 0.85) / 0.15
        ctx.strokeStyle = `rgb(235 248 255 / ${0.6 * (1 - u)})`
        ctx.beginPath()
        ctx.arc(b.x, y, b.r * (1 + u * 1.8), 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }
}
