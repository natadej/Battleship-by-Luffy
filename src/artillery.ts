// Cannon + rocket animation between the two boards, driven with the Web Animations API.
// Each cannon rides the edge of its own board (a perimeter position in 0..1, clockwise from
// the top-left corner), slides round the corners towards the target, aims, then fires a rocket
// along an arc into the target cell on the other board.

import { playLaunch } from './sound'

export const MOVE_MS = 450
export const AIM_MS = 100
export const FLIGHT_MS = 700
/** Total time from click to impact. */
export const SHOT_MS = MOVE_MS + AIM_MS + FLIGHT_MS

type Pt = { x: number; y: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Waits for an animation, but never much past its nominal duration (slow devices drop frames). */
const settle = (a: Animation, ms: number) => Promise.race([a.finished.catch(() => undefined), sleep(ms)])
const center = (r: DOMRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
const angleTo = (from: Pt, to: Pt) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI

/** Point on the rectangle's perimeter (w × h) for a position f in 0..1. */
function pointAt(f: number, w: number, h: number): Pt {
  let d = (((f % 1) + 1) % 1) * 2 * (w + h)
  if (d < w) return { x: d, y: 0 }
  d -= w
  if (d < h) return { x: w, y: d }
  d -= h
  if (d < w) return { x: w - d, y: h }
  return { x: 0, y: h - (d - w) }
}

/** Perimeter position closest to point p (relative to the rectangle). */
function nearestPosition(p: Pt, w: number, h: number): number {
  const P = 2 * (w + h)
  const x = Math.min(Math.max(p.x, 0), w)
  const y = Math.min(Math.max(p.y, 0), h)
  const options = [
    { d: Math.abs(p.y), f: x / P }, // top
    { d: Math.abs(p.x - w), f: (w + y) / P }, // right
    { d: Math.abs(p.y - h), f: (2 * w + h - x) / P }, // bottom
    { d: Math.abs(p.x), f: (2 * w + 2 * h - y) / P }, // left
  ]
  return options.reduce((a, b) => (b.d < a.d ? b : a)).f
}

/** Positions to visit going the short way round from f0 to f1, including the corners passed. */
function perimeterPath(f0: number, f1: number, w: number, h: number): number[] {
  const P = 2 * (w + h)
  const corners = [0, w / P, (w + h) / P, (2 * w + h) / P]
  let delta = f1 - f0
  if (delta > 0.5) delta -= 1
  if (delta < -0.5) delta += 1
  const stops = [f0]
  for (const c of corners) {
    for (const k of [-1, 0, 1]) {
      const cc = c + k
      const t = (cc - f0) / delta
      if (delta !== 0 && t > 0.001 && t < 0.999) stops.push(cc)
    }
  }
  stops.sort((a, b) => (delta >= 0 ? a - b : b - a))
  stops.push(f0 + delta)
  return stops
}

/** Turns a sequence of angles into a continuous one (no 359° → 1° spins). */
function unwrap(angles: number[]): number[] {
  const out = [angles[0]]
  for (let i = 1; i < angles.length; i++) {
    let a = angles[i]
    while (a - out[i - 1] > 180) a -= 360
    while (a - out[i - 1] < -180) a += 360
    out.push(a)
  }
  return out
}

export interface Battery {
  cannon: HTMLElement
  turret: HTMLElement
  /** The element whose edge the cannon rides. */
  track: HTMLElement
}

/** Puts a cannon at perimeter position f, aiming at `angle` degrees. */
export function placeCannon({ cannon, turret }: Battery, f: number, angle: number) {
  const p = pointAt(f, 100, 100)
  cannon.style.left = `${p.x}%`
  cannon.style.top = `${p.y}%`
  cannon.dataset.pos = String(((f % 1) + 1) % 1)
  turret.style.transform = `rotate(${angle}deg)`
  turret.dataset.angle = String(angle)
}

/**
 * Slides the cannon round its board towards the target, aims, and fires a rocket at it.
 * Resolves when the rocket lands.
 */
export async function fireRocket(battery: Battery, target: HTMLElement, layer: HTMLElement): Promise<void> {
  const { cannon, turret, track } = battery
  const box = track.getBoundingClientRect()
  const goal = center(target.getBoundingClientRect())
  const rel = { x: goal.x - box.left, y: goal.y - box.top }

  const f0 = Number(cannon.dataset.pos ?? 0)
  const f1 = nearestPosition(rel, box.width, box.height)
  const stops = perimeterPath(f0, f1, box.width, box.height)
  const pts = stops.map((f) => pointAt(f, box.width, box.height))
  const dist = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y))
  const total = dist.reduce((a, b) => a + b, 0) || 1
  let acc = 0
  const offsets = [0, ...dist.map((d) => (acc += d) / total)]
  const angles = unwrap(
    pts.map((p) => angleTo({ x: p.x + box.left, y: p.y + box.top }, goal)).map((a, i) => (i === 0 ? Number(turret.dataset.angle ?? a) : a)),
  )

  const moveOpts: KeyframeAnimationOptions = { duration: MOVE_MS, easing: 'ease-in-out', fill: 'forwards' }
  const move = cannon.animate(
    pts.map((p, i) => ({ left: `${(p.x / box.width) * 100}%`, top: `${(p.y / box.height) * 100}%`, offset: offsets[i] })),
    moveOpts,
  )
  const aim = turret.animate(
    angles.map((a, i) => ({ transform: `rotate(${a}deg)`, offset: offsets[i] })),
    moveOpts,
  )
  await settle(move, MOVE_MS)
  placeCannon(battery, stops[stops.length - 1], angles[angles.length - 1])
  move.cancel()
  aim.cancel()

  await sleep(AIM_MS)
  cannon.classList.remove('firing')
  void cannon.offsetWidth
  cannon.classList.add('firing')
  playLaunch()

  // Rocket: from the muzzle along a quadratic arc that peaks above the midpoint.
  const muzzleAngle = (angles[angles.length - 1] * Math.PI) / 180
  const base = center(cannon.getBoundingClientRect())
  const start = { x: base.x + Math.cos(muzzleAngle) * 16, y: base.y + Math.sin(muzzleAngle) * 16 }
  const span = Math.hypot(goal.x - start.x, goal.y - start.y)
  const ctrl = { x: (start.x + goal.x) / 2, y: Math.min(start.y, goal.y) - span * 0.35 - 30 }
  const N = 28
  const bez = (t: number): Pt => ({
    x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * ctrl.x + t ** 2 * goal.x,
    y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * ctrl.y + t ** 2 * goal.y,
  })
  const path = Array.from({ length: N + 1 }, (_, i) => bez(i / N))
  const heading = unwrap(path.map((_, i) => angleTo(path[Math.max(0, i - 1)], path[Math.min(N, i + 1)])))

  const rocket = document.createElement('div')
  rocket.className = 'rocket'
  rocket.innerHTML = '<span class="rocket-trail"></span><span class="rocket-body"></span>'
  layer.appendChild(rocket)
  const flight = rocket.animate(
    path.map((p, i) => ({
      transform: `translate(${p.x}px, ${p.y}px) rotate(${heading[i]}deg) scale(${1 + Math.sin((i / N) * Math.PI) * 0.6})`,
    })),
    { duration: FLIGHT_MS, easing: 'cubic-bezier(.35,.1,.6,1)', fill: 'forwards' },
  )
  await settle(flight, FLIGHT_MS)
  rocket.remove()
}
