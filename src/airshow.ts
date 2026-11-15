// Air battle around the two boards, drawn on one canvas: jets, helicopters and B-52 formations
// fly over, machine guns and rocket launchers ride the board edges, and everyone shoots at
// squares that have already been attacked or at enemy aircraft, which can be shot down.
// Ambient fire is cosmetic. Real damage only comes from `strike()`, the 10-second air raids.

import {
  playBomber,
  playExplosion,
  playHelicopter,
  playJet,
  playMachineGun,
  playMissile,
  playPop,
  playSiren,
  playSplash,
} from './sound'

type Pt = { x: number; y: number }
export type Team = 'player' | 'enemy'
type Kind = 'heli' | 'gripen' | 'f14' | 'f16' | 'b52'
type BoardId = 'own' | 'enemy'

export interface StrikeTarget {
  board: BoardId
  r: number
  c: number
  hit: boolean
}

interface Plane {
  kind: Kind
  team: Team
  born: number
  life: number
  route: (age: number) => Pt
  x: number
  y: number
  heading: number
  hp: number
  nextFire: number
  strike?: { at: number; to: Pt; hit: boolean; dropped?: boolean }
  down?: { at: number; vx: number; vy: number; spin: number }
}

interface Gun {
  team: Team
  kind: 'mg' | 'launcher'
  f: number
  v: number
  aim: number
  nextFire: number
  fired: number
}

interface Shot {
  kind: 'tracer' | 'missile' | 'bomb'
  from: Pt
  to: Pt
  t0: number
  dur: number
  target?: Plane
  hitChance: number
  land?: () => void
  smoked?: number
}

interface Fx {
  kind: 'blast' | 'smoke' | 'splash' | 'flak'
  x: number
  y: number
  t0: number
  dur: number
  size: number
}

const JETS: Kind[] = ['gripen', 'f14', 'f16']
const SPEED: Record<Kind, number> = { heli: 0, gripen: 400, f14: 340, f16: 380, b52: 110 }
const HP: Record<Kind, number> = { heli: 2, gripen: 2, f14: 2, f16: 2, b52: 3 }
const COLORS: Record<Team, { fill: string; line: string }> = {
  player: { fill: '#d6e6f5', line: '#2f6aa8' },
  enemy: { fill: '#f2b3a2', line: '#9a2f20' },
}

/** Half outlines (nose pointing +x), mirrored across the x axis. Pods are engine/fuel tank dots. */
const SHAPES: Record<Exclude<Kind, 'heli'>, { size: number; parts: number[][]; pods?: number[] }> = {
  f16: { size: 1, parts: [[15, 0, 7, -1.8, -12, -1.8, -14, 0], [5, -1.8, -5, -11, -8, -11, -6, -1.8], [-9, -1.8, -13, -6, -15, -6, -14, -1.8]] },
  f14: {
    size: 1.1,
    parts: [[16, 0, 8, -2.2, -12, -3, -15, 0], [6, -3, -7, -15, -10, -15, -4, -3], [-10, -3, -14, -8, -16, -8, -15, -3]],
    pods: [-13, -3.4],
  },
  gripen: { size: 0.95, parts: [[15, 0, 8, -1.6, -12, -1.6, -13, 0], [3, -1.6, -10, -9.5, -12, -9.5, -11, -1.6], [9, -1.6, 6, -5, 5, -5, 6, -1.6]] },
  b52: {
    size: 1.9,
    parts: [[18, 0, 14, -1.8, -16, -1.8, -18, 0], [6, -1.8, -4, -21, -7, -21, -2, -1.8], [-14, -1.8, -18, -7, -20, -7, -18, -1.8]],
    pods: [2, -7, -0.5, -12, -3, -17],
  },
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]
const lerp = (a: Pt, b: Pt, u: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u })
const centerOf = (r: DOMRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
const homeBoard = (team: Team): BoardId => (team === 'player' ? 'own' : 'enemy')
const targetBoard = (team: Team): BoardId => (team === 'player' ? 'enemy' : 'own')

function gridRect(board: BoardId): DOMRect | null {
  return document.querySelector(`.grid[data-board="${board}"]`)?.getBoundingClientRect() ?? null
}

function cellCenter(board: BoardId, r: number, c: number): Pt | null {
  const el = document.querySelector(`.grid[data-board="${board}"] [data-cell="${r}-${c}"]`)
  return el ? centerOf(el.getBoundingClientRect()) : null
}

/** A square that has already been attacked (hits first), or a spot on the board's rim. */
function attackedSpot(board: BoardId): Pt | null {
  const hits = document.querySelectorAll(`.grid[data-board="${board}"] .cell.hit`)
  const all = hits.length && Math.random() < 0.7 ? hits : document.querySelectorAll(`.grid[data-board="${board}"] .cell.hit, .grid[data-board="${board}"] .cell.miss`)
  if (all.length) return centerOf(pick([...all]).getBoundingClientRect())
  const r = gridRect(board)
  return r && perimeter(r, Math.random(), 10)
}

/** Point on a rectangle's outline (grown by pad) at position f in 0..1, clockwise from top-left. */
function perimeter(r: DOMRect, f: number, pad: number): Pt {
  const w = r.width + 2 * pad
  const h = r.height + 2 * pad
  let d = (((f % 1) + 1) % 1) * 2 * (w + h)
  const x0 = r.left - pad
  const y0 = r.top - pad
  if (d < w) return { x: x0 + d, y: y0 }
  d -= w
  if (d < h) return { x: x0 + w, y: y0 + d }
  d -= h
  if (d < w) return { x: x0 + w - d, y: y0 + h }
  return { x: x0, y: y0 + h - (d - w) }
}

export class AirShow {
  private ctx: CanvasRenderingContext2D
  private planes: Plane[] = []
  private guns: Gun[] = []
  private shots: Shot[] = []
  private fx: Fx[] = []
  private raf = 0
  private last = 0
  private w = 0
  private h = 0
  private next: Record<string, number> = {}
  private heard: Record<string, number> = {}
  private calm = matchMedia('(prefers-reduced-motion: reduce)').matches
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
    addEventListener('resize', this.resize)
    const t = this.now()
    for (const team of ['player', 'enemy'] as Team[]) {
      for (const [kind, f] of [['mg', 0.1], ['launcher', 0.4], ['mg', 0.7]] as const)
        this.guns.push({ team, kind, f: f + rand(-0.05, 0.05), v: rand(-0.025, 0.025), aim: 0, nextFire: t + rand(1, 3), fired: 0 })
      this.next[`heli-${team}`] = t + rand(0.5, 3)
      this.next[`jet-${team}`] = t + rand(1, 4)
    }
    this.next.b52 = t + rand(5, 9)
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    removeEventListener('resize', this.resize)
  }

  /** Air raid: a siren, then one strike jet per target drops a bomb on it. Resolves after the last impact. */
  strike(targets: StrikeTarget[]): Promise<void> {
    this.sfx('siren', 0, playSiren)
    const t = this.now()
    const scale = this.scale()
    let end = 0.4
    targets.forEach((tg, i) => {
      const to = cellCenter(tg.board, tg.r, tg.c)
      if (!to) return
      const team = tg.board === 'enemy' ? 'player' : 'enemy'
      const v = 560 * scale
      const fall = 0.6
      const approach = 0.9 + i * 0.2
      const a = rand(0, Math.PI * 2)
      const dir = { x: Math.cos(a), y: Math.sin(a) }
      const release = { x: to.x - dir.x * v * fall * 0.5, y: to.y - dir.y * v * fall * 0.5 }
      const start = { x: release.x - dir.x * v * approach, y: release.y - dir.y * v * approach }
      const far = Math.hypot(this.w, this.h) + v * approach
      const finish = { x: start.x + dir.x * far, y: start.y + dir.y * far }
      this.planes.push({
        kind: pick(JETS),
        team,
        born: t,
        life: far / v,
        route: (age) => lerp(start, finish, (age * v) / far),
        ...start,
        heading: a,
        hp: Infinity,
        nextFire: Infinity,
        strike: { at: t + approach, to, hit: tg.hit },
      })
      end = Math.max(end, approach + fall)
    })
    this.sfx('jet', 0, playJet)
    return new Promise((resolve) => setTimeout(resolve, end * 1000 + 80))
  }

  private resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    this.w = innerWidth
    this.h = innerHeight
    this.canvas.width = this.w * dpr
    this.canvas.height = this.h * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private now = () => performance.now() / 1000
  private scale = () => Math.min(1.15, Math.max(0.65, this.w / 1000))

  /** Plays a sound at most once per `gap` seconds. */
  private sfx(key: string, gap: number, play: () => void) {
    const t = this.now()
    if (t - (this.heard[key] ?? -99) < gap) return
    this.heard[key] = t
    play()
  }

  private frame = (ms: number) => {
    const t = ms / 1000
    const dt = Math.min(0.05, t - (this.last || t))
    this.last = t
    this.update(this.now(), dt)
    this.draw(this.now())
    this.raf = requestAnimationFrame(this.frame)
  }

  // ---- simulation -------------------------------------------------------------------------

  private update(t: number, dt: number) {
    this.spawn(t)
    const rects = { own: gridRect('own'), enemy: gridRect('enemy') }

    for (const p of this.planes) {
      if (p.down) {
        const k = t - p.down.at
        p.x += p.down.vx * dt
        p.y += p.down.vy * dt
        p.heading += p.down.spin * dt
        if (Math.random() < 0.6) this.puff('smoke', p.x, p.y, 0.9, 6)
        if (k > 1.6) {
          this.puff('blast', p.x, p.y, 0.6, 18)
          this.puff('splash', p.x, p.y, 0.8, 16)
          p.life = 0
        }
        continue
      }
      const pos = p.route(t - p.born)
      const dx = pos.x - p.x
      const dy = pos.y - p.y
      if (dx * dx + dy * dy > 0.01) {
        const want = Math.atan2(dy, dx)
        let d = want - p.heading
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        p.heading += d * Math.min(1, dt * 8)
      }
      p.x = pos.x
      p.y = pos.y
      if (p.strike && !p.strike.dropped && t >= p.strike.at) {
        p.strike.dropped = true
        const { to, hit } = p.strike
        this.shots.push({
          kind: 'bomb',
          from: { x: p.x, y: p.y },
          to,
          t0: t,
          dur: 0.6,
          hitChance: 0,
          land: () => {
            if (hit) {
              this.puff('blast', to.x, to.y, 0.9, 30)
              playExplosion(true)
            } else {
              this.puff('splash', to.x, to.y, 0.9, 24)
              playSplash()
            }
            for (let i = 0; i < 4; i++) this.puff('smoke', to.x + rand(-8, 8), to.y + rand(-8, 8), 1.4, 10)
          },
        })
      }
      if (t >= p.nextFire && this.onScreen(p)) this.planeFire(p, t)
    }
    this.planes = this.planes.filter((p) => p.down || t - p.born < p.life)

    for (const g of this.guns) {
      const r = rects[homeBoard(g.team)]
      if (!r) continue
      if (Math.random() < dt * 0.3) g.v = -g.v
      g.f += g.v * dt
      const pos = perimeter(r, g.f, 14)
      if (t >= g.nextFire) this.gunFire(g, pos, t)
    }

    for (const s of this.shots) {
      if (s.kind === 'missile' && s.target && !s.target.down) s.to = { x: s.target.x, y: s.target.y }
      if (s.kind === 'missile' && t - (s.smoked ?? 0) > 0.03) {
        s.smoked = t
        const p = this.shotPos(s, t)
        this.puff('smoke', p.x, p.y, 0.6, 3)
      }
    }
    const done = this.shots.filter((s) => t - s.t0 >= s.dur)
    this.shots = this.shots.filter((s) => t - s.t0 < s.dur)
    for (const s of done) {
      s.land?.()
      if (s.target && !s.target.down && s.target.hp !== Infinity && Math.random() < s.hitChance) this.damage(s.target, t)
      else if (!s.land) this.puff(s.kind === 'tracer' ? 'flak' : 'blast', s.to.x, s.to.y, 0.35, s.kind === 'tracer' ? 5 : 12)
    }
    this.fx = this.fx.filter((f) => t - f.t0 < f.dur)
  }

  private spawn(t: number) {
    const slow = this.calm ? 2 : 1
    for (const team of ['player', 'enemy'] as Team[]) {
      const heliKey = `heli-${team}`
      if (t >= this.next[heliKey] && !this.planes.some((p) => p.kind === 'heli' && p.team === team)) {
        this.spawnHeli(team, t)
        this.next[heliKey] = t + rand(4, 8) * slow
      }
      const jetKey = `jet-${team}`
      if (t >= this.next[jetKey]) {
        if (this.planes.length < 12) this.spawnJet(pick(JETS), team, t)
        this.next[jetKey] = t + rand(3, 6) * slow
      }
    }
    if (t >= this.next.b52) {
      const team = pick<Team>(['player', 'enemy'])
      const lead = this.spawnJet('b52', team, t)
      const back = { x: -Math.cos(lead.heading), y: -Math.sin(lead.heading) }
      const side = { x: -back.y, y: back.x }
      const s = this.scale() * 46
      for (const k of [-1, 1]) {
        const off = { x: (back.x * 0.8 + side.x * k) * s, y: (back.y * 0.8 + side.y * k) * s }
        this.planes.push({ ...lead, route: (age) => {
          const p = lead.route(age)
          return { x: p.x + off.x, y: p.y + off.y }
        }, hp: HP.b52, nextFire: t + rand(2, 3) })
      }
      this.sfx('bomber', 3, playBomber)
      this.next.b52 = t + rand(16, 24) * slow
    }
  }

  private spawnJet(kind: Kind, team: Team, t: number): Plane {
    const c = { x: this.w / 2, y: this.h / 2 }
    const R = Math.hypot(this.w, this.h) / 2 + 60
    const a = rand(0, Math.PI * 2)
    const b = a + Math.PI + rand(-0.6, 0.6)
    const from = { x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R }
    const to = { x: c.x + Math.cos(b) * R, y: c.y + Math.sin(b) * R }
    const len = Math.hypot(to.x - from.x, to.y - from.y)
    const v = SPEED[kind] * this.scale()
    const bend = rand(-0.25, 0.25) * len
    const perp = { x: -(to.y - from.y) / len, y: (to.x - from.x) / len }
    const plane: Plane = {
      kind,
      team,
      born: t,
      life: len / v,
      route: (age) => {
        const u = (age * v) / len
        const p = lerp(from, to, u)
        const k = Math.sin(u * Math.PI) * bend
        return { x: p.x + perp.x * k, y: p.y + perp.y * k }
      },
      ...from,
      heading: Math.atan2(to.y - from.y, to.x - from.x),
      hp: HP[kind],
      nextFire: t + rand(0.8, 1.6),
    }
    this.planes.push(plane)
    if (kind !== 'b52') this.sfx('jet', 1.5, playJet)
    return plane
  }

  private spawnHeli(team: Team, t: number) {
    const board = targetBoard(team)
    const enter = 3
    const stay = rand(12, 18)
    const omega = rand(0.25, 0.4) * pick([-1, 1])
    const th0 = rand(0, Math.PI * 2)
    const away = { x: Math.cos(th0) * (this.w + this.h), y: Math.sin(th0) * (this.w + this.h) }
    const orbit = (th: number): Pt => {
      const r = gridRect(board)
      if (!r) return { x: this.w / 2, y: this.h / 2 }
      const c = centerOf(r)
      return { x: c.x + Math.cos(th) * (r.width / 2 + 26), y: c.y + Math.sin(th) * (r.height / 2 + 26) }
    }
    const ease = (u: number) => u * u * (3 - 2 * u)
    this.planes.push({
      kind: 'heli',
      team,
      born: t,
      life: enter * 2 + stay,
      route: (age) => {
        const p = orbit(th0 + omega * age)
        if (age < enter) {
          const u = ease(age / enter)
          return { x: p.x + away.x * (1 - u), y: p.y + away.y * (1 - u) }
        }
        if (age > enter + stay) {
          const u = ease((age - enter - stay) / enter)
          return { x: p.x - away.y * u, y: p.y + away.x * u }
        }
        return p
      },
      ...{ x: away.x, y: away.y },
      heading: 0,
      hp: HP.heli,
      nextFire: t + enter + rand(0, 1),
    })
    this.sfx('heli', 2, playHelicopter)
  }

  private onScreen = (p: Plane) => p.x > -20 && p.y > -20 && p.x < this.w + 20 && p.y < this.h + 20

  private enemyPlaneNear(team: Team, from: Pt, range: number): Plane | undefined {
    let best: Plane | undefined
    let bestD = range
    for (const p of this.planes) {
      if (p.team === team || p.down || p.hp === Infinity || !this.onScreen(p)) continue
      const d = Math.hypot(p.x - from.x, p.y - from.y)
      if (d < bestD) {
        best = p
        bestD = d
      }
    }
    return best
  }

  private planeFire(p: Plane, t: number) {
    const from = { x: p.x, y: p.y }
    if (p.kind === 'heli') {
      const spot = attackedSpot(targetBoard(p.team))
      if (spot) this.burst(from, spot, t, undefined)
      p.nextFire = t + rand(1.4, 2.8)
    } else if (p.kind === 'b52') {
      const spot = attackedSpot(targetBoard(p.team))
      if (spot) this.shots.push({ kind: 'bomb', from, to: spot, t0: t, dur: 0.8, hitChance: 0 })
      p.nextFire = t + rand(1.2, 2)
    } else {
      const foe = Math.random() < 0.55 ? this.enemyPlaneNear(p.team, from, 520) : undefined
      const to = foe ? { x: foe.x, y: foe.y } : attackedSpot(targetBoard(p.team))
      if (to) this.missile(from, to, t, foe, 0.35)
      p.nextFire = t + rand(1.5, 2.6)
    }
  }

  private gunFire(g: Gun, from: Pt, t: number) {
    const foe = this.enemyPlaneNear(g.team, from, 460)
    const to = foe ? { x: foe.x, y: foe.y } : Math.random() < 0.5 ? attackedSpot(targetBoard(g.team)) : null
    g.nextFire = t + (g.kind === 'mg' ? rand(1.2, 2.4) : rand(3, 5))
    if (!to) return
    g.aim = Math.atan2(to.y - from.y, to.x - from.x)
    g.fired = t
    if (g.kind === 'mg') this.burst(from, to, t, foe)
    else this.missile(from, to, t, foe, 0.5)
  }

  private burst(from: Pt, to: Pt, t: number, foe: Plane | undefined) {
    const d = Math.hypot(to.x - from.x, to.y - from.y)
    for (let i = 0; i < 6; i++) {
      const spread = foe ? 0 : 6
      this.shots.push({
        kind: 'tracer',
        from,
        to: { x: to.x + rand(-spread, spread), y: to.y + rand(-spread, spread) },
        t0: t + i * 0.07,
        dur: d / 900 + 0.05,
        target: i === 5 ? foe : undefined,
        hitChance: 0.3,
      })
    }
    this.sfx('mg', 0.35, playMachineGun)
  }

  private missile(from: Pt, to: Pt, t: number, foe: Plane | undefined, hitChance: number) {
    const d = Math.hypot(to.x - from.x, to.y - from.y)
    this.shots.push({ kind: 'missile', from, to, t0: t, dur: Math.max(0.4, d / 520), target: foe, hitChance })
    this.sfx('missile', 0.4, playMissile)
  }

  private damage(p: Plane, t: number) {
    p.hp -= 1
    this.puff('flak', p.x, p.y, 0.4, 10)
    if (p.hp > 0) return
    const v = p.kind === 'heli' ? 30 : SPEED[p.kind] * this.scale() * 0.5
    p.down = { at: t, vx: Math.cos(p.heading) * v, vy: Math.sin(p.heading) * v + 20, spin: rand(2, 5) * pick([-1, 1]) }
    this.puff('blast', p.x, p.y, 0.6, 20)
    this.sfx('pop', 0.2, playPop)
  }

  private puff(kind: Fx['kind'], x: number, y: number, dur: number, size: number) {
    if (this.fx.length < 400) this.fx.push({ kind, x, y, t0: this.now(), dur, size: size * this.scale() })
  }

  private shotPos(s: Shot, t: number): Pt {
    const u = Math.min(1, Math.max(0, (t - s.t0) / s.dur))
    return lerp(s.from, s.to, s.kind === 'bomb' ? u * u : u)
  }

  // ---- drawing ----------------------------------------------------------------------------

  private draw(t: number) {
    const { ctx } = this
    ctx.clearRect(0, 0, this.w, this.h)
    for (const f of this.fx) if (f.kind === 'smoke') this.drawFx(f, t)
    for (const g of this.guns) this.drawGun(g, t)
    for (const s of this.shots) if (t >= s.t0) this.drawShot(s, t)
    const s = this.scale() * 1.25
    for (const p of this.planes) this.drawPlane(p, t, s, true)
    for (const p of this.planes) this.drawPlane(p, t, s, false)
    for (const f of this.fx) if (f.kind !== 'smoke') this.drawFx(f, t)
  }

  private drawPlane(p: Plane, t: number, s: number, shadow: boolean) {
    const { ctx } = this
    const size = (p.kind === 'heli' ? 1 : SHAPES[p.kind].size) * s * (p.down ? Math.max(0.4, 1 - (t - p.down.at) / 2) : 1)
    const alt = p.kind === 'heli' ? 6 : p.kind === 'b52' ? 22 : 14
    ctx.save()
    ctx.translate(p.x + (shadow ? alt * s : 0), p.y + (shadow ? alt * 1.3 * s : 0))
    ctx.rotate(p.heading)
    ctx.scale(size, size)
    const { fill, line } = COLORS[p.team]
    ctx.fillStyle = shadow ? 'rgb(0 0 0 / 0.22)' : fill
    ctx.strokeStyle = line
    ctx.lineWidth = 1.2 / size
    if (p.kind === 'heli') {
      ctx.beginPath()
      ctx.ellipse(1, 0, 7, 4, 0, 0, Math.PI * 2)
      ctx.rect(-17, -1, 12, 2)
      ctx.rect(-18, -4, 2, 8)
      ctx.fill()
      if (!shadow) {
        ctx.stroke()
        ctx.strokeStyle = 'rgb(220 230 240 / 0.7)'
        ctx.lineWidth = 1.6 / size
        const a = t * 28
        ctx.beginPath()
        for (const k of [0, Math.PI / 2]) {
          ctx.moveTo(1 + Math.cos(a + k) * 13, Math.sin(a + k) * 13)
          ctx.lineTo(1 - Math.cos(a + k) * 13, -Math.sin(a + k) * 13)
        }
        ctx.stroke()
        ctx.fillStyle = 'rgb(220 230 240 / 0.12)'
        ctx.beginPath()
        ctx.arc(1, 0, 13, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      const shape = SHAPES[p.kind]
      ctx.beginPath()
      for (const part of shape.parts) {
        ctx.moveTo(part[0], part[1])
        for (let i = 2; i < part.length; i += 2) ctx.lineTo(part[i], part[i + 1])
        for (let i = part.length - 2; i >= 0; i -= 2) ctx.lineTo(part[i], -part[i + 1])
        ctx.closePath()
      }
      ctx.fill()
      if (!shadow) {
        ctx.stroke()
        ctx.fillStyle = line
        const pods = shape.pods ?? []
        for (let i = 0; i < pods.length; i += 2)
          for (const m of [1, -1]) {
            ctx.beginPath()
            ctx.ellipse(pods[i], pods[i + 1] * m, 2.4, 1, 0, 0, Math.PI * 2)
            ctx.fill()
          }
        // Afterburner flicker.
        ctx.fillStyle = `rgb(255 ${150 + Math.random() * 80} 60 / 0.8)`
        ctx.beginPath()
        ctx.ellipse(p.kind === 'b52' ? -18 : -15, 0, 2 + Math.random() * 1.5, 1, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  private drawGun(g: Gun, t: number) {
    const r = gridRect(homeBoard(g.team))
    if (!r) return
    const { ctx } = this
    const p = perimeter(r, g.f, 14)
    const s = this.scale()
    const { fill, line } = COLORS[g.team]
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.fillStyle = line
    ctx.beginPath()
    ctx.arc(0, 0, 6 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.rotate(g.aim)
    ctx.fillStyle = fill
    ctx.strokeStyle = fill
    if (g.kind === 'mg') {
      ctx.lineWidth = 2.2 * s
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(11 * s, 0)
      ctx.stroke()
    } else {
      ctx.fillRect(-4 * s, -5 * s, 12 * s, 10 * s)
      ctx.fillStyle = line
      for (const y of [-2.5, 2.5]) ctx.fillRect(1 * s, (y - 1) * s, 7 * s, 2 * s)
    }
    if (t - g.fired < 0.45 && g.kind === 'mg' && Math.random() < 0.6) {
      ctx.fillStyle = '#ffd36b'
      ctx.beginPath()
      ctx.arc(12 * s, 0, 3 * s, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  private drawShot(s: Shot, t: number) {
    const { ctx } = this
    const p = this.shotPos(s, t)
    const k = this.scale()
    if (s.kind === 'tracer') {
      const a = Math.atan2(s.to.y - s.from.y, s.to.x - s.from.x)
      ctx.strokeStyle = '#ffe27a'
      ctx.lineWidth = 1.6 * k
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - Math.cos(a) * 10 * k, p.y - Math.sin(a) * 10 * k)
      ctx.stroke()
    } else if (s.kind === 'missile') {
      ctx.fillStyle = '#f4f4f4'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.4 * k, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ff9a3c'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 1.3 * k, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const u = Math.min(1, (t - s.t0) / s.dur)
      ctx.fillStyle = '#1b1f24'
      ctx.strokeStyle = '#e8e8e8'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, (4 - u * 2) * k, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  private drawFx(f: Fx, t: number) {
    const { ctx } = this
    const k = (t - f.t0) / f.dur
    if (k < 0) return
    if (f.kind === 'blast') {
      const r = f.size * (0.4 + k)
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r)
      g.addColorStop(0, `rgb(255 250 220 / ${1 - k})`)
      g.addColorStop(0.35, `rgb(255 170 50 / ${0.9 * (1 - k)})`)
      g.addColorStop(1, 'rgb(200 40 10 / 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2)
      ctx.fill()
    } else if (f.kind === 'smoke') {
      ctx.fillStyle = `rgb(150 155 160 / ${0.35 * (1 - k)})`
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.size * (0.5 + k * 1.5), 0, Math.PI * 2)
      ctx.fill()
    } else if (f.kind === 'splash') {
      ctx.strokeStyle = `rgb(220 240 255 / ${1 - k})`
      ctx.lineWidth = 2
      for (const m of [1, 0.6]) {
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.size * k * m + 2, 0, Math.PI * 2)
        ctx.stroke()
      }
    } else {
      ctx.strokeStyle = `rgb(255 220 120 / ${1 - k})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        ctx.moveTo(f.x + Math.cos(a) * f.size * 0.3, f.y + Math.sin(a) * f.size * 0.3)
        ctx.lineTo(f.x + Math.cos(a) * f.size * (0.5 + k), f.y + Math.sin(a) * f.size * (0.5 + k))
      }
      ctx.stroke()
    }
  }
}
