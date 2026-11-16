// The animation of one shot by either side, drawn on a short-lived full-screen canvas over the squares
// the weapon hits. The game applies the shot when the returned promise resolves, `ms` after firing.

import type { Coord } from './game/board'
import type { Weapon } from './game/weapons'
import { playBomber, playJet, playMachineGun, playMissile, playNuke } from './sound'

const LABEL: Record<Weapon, string> = {
  mg: 'MACHINE GUN',
  nuke: 'NUCLEAR BOMB',
  b52: 'B-52 BOMBS',
  missile: 'MISSILE',
}

/** Seconds the effect keeps burning after impact. */
const AFTER_S = 1.2
type Theme = { fill: string; line: string }
/** The attacker's colours: blue for the player, red for the enemy. */
const THEME: Record<'own' | 'enemy', Theme> = {
  enemy: { fill: '#a9d2ff', line: '#1f5fb0' },
  own: { fill: '#ffb3a8', line: '#b0261f' },
}
const themes = new WeakMap<CanvasRenderingContext2D, Theme>()
const fillOf = (ctx: CanvasRenderingContext2D) => themes.get(ctx)!.fill
const lineOf = (ctx: CanvasRenderingContext2D) => themes.get(ctx)!.line

type Pt = { x: number; y: number }
type Cell = Pt & { dr: number; dc: number }
type Ctx = CanvasRenderingContext2D
interface Scene {
  hit: number
  goal: Pt
  size: number
  area: Cell[]
  /** +1 if the attacker's aircraft travel right, -1 if left. */
  dir: number
}
type Draw = (ctx: Ctx, t: number) => void

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp01 = (u: number) => Math.min(1, Math.max(0, u))
const lerp = (a: Pt, b: Pt, u: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u })
const centre = (r: DOMRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
const rectOf = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null
const cellSel = (board: string, r: number, c: number) => `.grid[data-board="${board}"] [data-cell="${r}-${c}"]`
const later = (s: number, f: () => void) => setTimeout(f, Math.max(0, s * 1000))

/** Fires `weapon` at `target` on `board`, hitting `cells` (target included). Resolves at impact, `ms` from now. */
export function strike(weapon: Weapon, board: 'own' | 'enemy', target: Coord, cells: Coord[], ms: number): Promise<void> {
  const done = new Promise<void>((resolve) => setTimeout(resolve, ms))
  const grid = rectOf(`.grid[data-board="${board}"]`)
  const at = rectOf(cellSel(board, target.r, target.c))
  if (!grid || !at || matchMedia('(prefers-reduced-motion: reduce)').matches) return done
  const home = rectOf(`.grid[data-board="${board === 'enemy' ? 'own' : 'enemy'}"]`)
  const area: Cell[] = []
  for (const p of cells) {
    const cell = rectOf(cellSel(board, p.r, p.c))
    if (cell) area.push({ ...centre(cell), dr: p.r - target.r, dc: p.c - target.c })
  }
  const scene: Scene = {
    hit: ms / 1000,
    goal: centre(at),
    size: at.width,
    area,
    dir: home ? Math.sign(centre(grid).x - centre(home).x) || 1 : 1,
  }

  const canvas = document.createElement('canvas')
  canvas.className = 'strike-layer'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  const dpr = Math.min(devicePixelRatio || 1, 2)
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  const ctx = canvas.getContext('2d')!
  themes.set(ctx, THEME[board])
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const draw = SCENES[weapon](scene)
  const t0 = performance.now() / 1000
  const frame = () => {
    const t = performance.now() / 1000 - t0
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    draw(ctx, t)
    drawLabel(ctx, scene, LABEL[weapon], t)
    if (t < scene.hit + AFTER_S) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
  return done
}

// ---- weapons --------------------------------------------------------------------------------

const SCENES: Record<Weapon, (s: Scene) => Draw> = {
  /** A fighter strafes the row of squares; the last round lands on the target. */
  mg: ({ hit, goal, size, area, dir }) => {
    const jetAt = (t: number): Pt => ({ x: goal.x + dir * size * (-1.6 + (t - hit) * 7), y: goal.y - size * 0.4 })
    const rounds = area.flatMap((p) =>
      [0, 1, 2].map(() => ({ at: rand(hit - 0.65, hit - 0.05), p: { x: p.x + rand(-0.3, 0.3) * size, y: p.y + rand(-0.3, 0.3) * size } })),
    )
    rounds.push({ at: hit, p: goal })
    playJet()
    for (const d of [0.65, 0.4, 0.15]) later(hit - d, () => playMachineGun(6))
    return (ctx, t) => {
      for (const b of rounds) {
        const age = t - b.at
        if (age < -0.08) continue
        if (age < 0) {
          const from = jetAt(b.at - 0.08)
          const head = lerp(from, b.p, clamp01((age + 0.08) / 0.08))
          const tail = lerp(from, b.p, clamp01((age + 0.05) / 0.08))
          line(ctx, tail, head, '#fff3b0', 2)
        } else {
          dot(ctx, b.p, size * 0.07, `rgb(20 20 20 / ${0.5 * clamp01(1 - (t - hit - AFTER_S + 0.4) / 0.4)})`)
          if (age < 0.3) glow(ctx, b.p, size * (0.12 + age * 0.6), 1 - age / 0.3)
        }
      }
      const j = jetAt(t)
      jet(ctx, j, dir > 0 ? 0 : Math.PI, size * 0.9)
    }
  },

  /** A warhead drops on the target: blinding flash, a fireball over the 3×3, a shockwave and a mushroom of smoke. */
  nuke: ({ hit, goal, size }) => {
    later(hit, () => {
      playNuke()
      document.getElementById('root')?.animate(
        [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ transform: i === 8 ? 'none' : `translate(${rand(-12, 12)}px, ${rand(-9, 9)}px)` })),
        { duration: 700, easing: 'ease-out' },
      )
    })
    const from = { x: goal.x, y: -size * 2 }
    return (ctx, t) => {
      if (t < hit) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 18)
        ring(ctx, goal, size * 1.55, `rgb(255 60 40 / ${0.35 + pulse * 0.4})`, 2)
        line(ctx, { x: goal.x - size * 1.8, y: goal.y }, { x: goal.x + size * 1.8, y: goal.y }, 'rgb(255 60 40 / 0.5)', 1)
        line(ctx, { x: goal.x, y: goal.y - size * 1.8 }, { x: goal.x, y: goal.y + size * 1.8 }, 'rgb(255 60 40 / 0.5)', 1)
        const u = clamp01((t - (hit - 0.8)) / 0.8)
        if (u > 0) bomb(ctx, lerp(from, goal, u * u), Math.PI / 2, size * (1.1 - u * 0.4), '#3c4a2c')
        return
      }
      const a = t - hit
      ctx.fillStyle = `rgb(255 255 240 / ${0.9 * clamp01(1 - a / 0.4)})`
      ctx.fillRect(0, 0, innerWidth, innerHeight)
      ring(ctx, goal, size * (1.2 + a * 7), `rgb(255 240 210 / ${0.8 * clamp01(1 - a / 0.8)})`, 4)
      const fade = clamp01(1 - (a - AFTER_S + 0.5) / 0.5)
      smoke(ctx, { x: goal.x, y: goal.y - a * size * 0.8 }, size * (1 + a * 0.9), 0.55 * clamp01(a / 0.4) * fade)
      fireball(ctx, goal, size * 1.7 * Math.min(1, 0.4 + a * 3) * (1 - a * 0.25), fade)
    }
  },

  /** A B-52 crosses the area dropping a bomb on each square it hits. */
  b52: ({ hit, goal, size, area, dir }) => {
    const speed = 9
    const over = hit - 0.25
    const planeAt = (t: number): Pt => ({ x: goal.x + dir * size * (t - over) * speed, y: goal.y })
    const bombs = area.map((p) => {
      const drop = over + (p.dc * dir) / speed
      return { p, drop, land: drop + 0.25 }
    })
    playBomber()
    return (ctx, t) => {
      for (const b of bombs) {
        const a = t - b.land
        if (t < b.drop) continue
        if (a < 0) {
          const u = (t - b.drop) / 0.25
          bomb(ctx, lerp({ x: planeAt(b.drop).x, y: goal.y + b.p.dr * size * 0.3 }, b.p, u), dir > 0 ? 0 : Math.PI, size * (0.7 - u * 0.25), '#3a3f44')
        } else blast(ctx, b.p, size * 0.75, a)
      }
      const fade = clamp01(t / 0.25)
      ctx.globalAlpha = fade
      bomber(ctx, planeAt(t), dir > 0 ? 0 : Math.PI, size * 1.6)
      ctx.globalAlpha = 1
    }
  },

  /** A missile arcs in from the attacker's side onto the target. */
  missile: ({ hit, goal, size, area, dir }) => {
    const launch = hit - 0.9
    const start = { x: goal.x - dir * size * 9, y: goal.y + size * 2.5 }
    const ctrl = { x: (start.x + goal.x) / 2, y: Math.min(start.y, goal.y) - size * 4 }
    const at = (u: number): Pt => ({
      x: (1 - u) ** 2 * start.x + 2 * (1 - u) * u * ctrl.x + u ** 2 * goal.x,
      y: (1 - u) ** 2 * start.y + 2 * (1 - u) * u * ctrl.y + u ** 2 * goal.y,
    })
    const cluster = area.map((p) => ({ p, at: p.dr === 0 && p.dc === 0 ? hit : hit + rand(0.06, 0.3) }))
    later(launch, playMissile)
    return (ctx, t) => {
      const u = clamp01((t - launch) / (hit - launch))
      if (t >= launch && t < hit) {
        for (let k = 0; k < 14; k++) {
          const v = u - k * 0.02
          if (v <= 0) break
          dot(ctx, at(v), size * (0.08 + k * 0.025), `rgb(220 230 240 / ${0.35 * (1 - k / 14)})`)
        }
        const p = at(u)
        const q = at(Math.min(1, u + 0.01))
        missile(ctx, p, Math.atan2(q.y - p.y, q.x - p.x), size * 0.8)
      }
      for (const b of cluster) if (t >= b.at) blast(ctx, b.p, size * (b.at === hit ? 1.1 : 0.6), t - b.at)
    }
  },
}

// ---- drawing --------------------------------------------------------------------------------

function drawLabel(ctx: Ctx, { goal, size, hit }: Scene, text: string, t: number) {
  const alpha = clamp01(t / 0.15) * clamp01((hit + 0.6 - t) / 0.3)
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = `800 ${Math.max(11, size * 0.42)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgb(5 15 30 / 0.85)'
  const y = goal.y - size * 1.9
  ctx.strokeText(text, goal.x, y)
  ctx.fillStyle = fillOf(ctx)
  ctx.fillText(text, goal.x, y)
  ctx.restore()
}

function line(ctx: Ctx, a: Pt, b: Pt, color: string, width: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
}

function dot(ctx: Ctx, p: Pt, r: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fill()
}

function ring(ctx: Ctx, p: Pt, r: number, color: string, width: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.stroke()
}

function glow(ctx: Ctx, p: Pt, r: number, alpha: number) {
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
  g.addColorStop(0, `rgb(255 255 220 / ${alpha})`)
  g.addColorStop(0.4, `rgb(255 200 80 / ${alpha * 0.8})`)
  g.addColorStop(1, 'rgb(255 120 0 / 0)')
  dot(ctx, p, r, '')
  ctx.fillStyle = g
  ctx.fill()
}

function fireball(ctx: Ctx, p: Pt, r: number, alpha: number) {
  if (r <= 0 || alpha <= 0) return
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
  g.addColorStop(0, `rgb(255 255 230 / ${alpha})`)
  g.addColorStop(0.25, `rgb(255 220 90 / ${alpha})`)
  g.addColorStop(0.6, `rgb(255 110 20 / ${alpha * 0.85})`)
  g.addColorStop(1, 'rgb(180 30 0 / 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fill()
}

function smoke(ctx: Ctx, p: Pt, r: number, alpha: number) {
  if (alpha <= 0) return
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
  g.addColorStop(0, `rgb(40 36 34 / ${alpha})`)
  g.addColorStop(1, 'rgb(40 36 34 / 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fill()
}

/** One explosion `age` seconds after it went off: fireball, then smoke. */
function blast(ctx: Ctx, p: Pt, r: number, age: number) {
  const fade = clamp01(1 - (age - 0.5) / 0.6)
  smoke(ctx, { x: p.x, y: p.y - age * r * 0.4 }, r * (0.6 + age * 0.8), 0.45 * clamp01(age / 0.2) * fade)
  if (age < 0.5) fireball(ctx, p, r * Math.min(1, 0.3 + age * 5) * (1 - age), 1 - age / 0.5)
}

function shape(ctx: Ctx, p: Pt, angle: number, s: number, pts: number[][]) {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(angle)
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)))
  ctx.closePath()
  ctx.fillStyle = fillOf(ctx)
  ctx.strokeStyle = lineOf(ctx)
  ctx.lineWidth = 1.5
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/** Shadow on the water under an aircraft. */
function shadow(ctx: Ctx, p: Pt, s: number) {
  ctx.fillStyle = 'rgb(0 10 30 / 0.25)'
  ctx.beginPath()
  ctx.ellipse(p.x + s * 0.3, p.y + s * 0.5, s * 0.55, s * 0.25, 0, 0, Math.PI * 2)
  ctx.fill()
}

function jet(ctx: Ctx, p: Pt, angle: number, s: number) {
  shadow(ctx, p, s)
  shape(ctx, p, angle, s, [
    [0.6, 0], [0.15, -0.08], [-0.05, -0.5], [-0.2, -0.5], [-0.15, -0.1], [-0.45, -0.25], [-0.5, -0.25],
    [-0.42, 0], [-0.5, 0.25], [-0.45, 0.25], [-0.15, 0.1], [-0.2, 0.5], [-0.05, 0.5], [0.15, 0.08],
  ])
}

function bomber(ctx: Ctx, p: Pt, angle: number, s: number) {
  shadow(ctx, p, s)
  shape(ctx, p, angle, s, [
    [0.55, 0], [0.4, -0.05], [0.05, -0.06], [-0.2, -0.6], [-0.3, -0.6], [-0.15, -0.06], [-0.4, -0.05],
    [-0.5, -0.22], [-0.55, -0.22], [-0.5, 0], [-0.55, 0.22], [-0.5, 0.22], [-0.4, 0.05], [-0.15, 0.06],
    [-0.3, 0.6], [-0.2, 0.6], [0.05, 0.06], [0.4, 0.05],
  ])
  for (const y of [-0.42, -0.25, 0.25, 0.42]) {
    const q = { x: p.x + Math.cos(angle) * -0.12 * s - Math.sin(angle) * y * s, y: p.y + Math.sin(angle) * -0.12 * s + Math.cos(angle) * y * s }
    dot(ctx, q, s * 0.035, lineOf(ctx))
  }
}

function missile(ctx: Ctx, p: Pt, angle: number, s: number) {
  const tail = { x: p.x - Math.cos(angle) * s * 0.4, y: p.y - Math.sin(angle) * s * 0.4 }
  fireball(ctx, tail, s * 0.25 * rand(0.8, 1.2), 1)
  shape(ctx, p, angle, s, [[0.4, 0], [0.3, -0.05], [-0.3, -0.05], [-0.4, -0.14], [-0.4, 0.14], [-0.3, 0.05], [0.3, 0.05]])
}

function bomb(ctx: Ctx, p: Pt, angle: number, s: number, body: string) {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(angle)
  ctx.fillStyle = body
  ctx.strokeStyle = lineOf(ctx)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.3, s * 0.11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = fillOf(ctx)
  ctx.fillRect(-s * 0.38, -s * 0.12, s * 0.08, s * 0.24)
  ctx.restore()
}
