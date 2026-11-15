// Air battle around the two boards, drawn on one canvas. Each side has 1 helicopter, 1 B-2 and 1 B-52,
// flying only toward the opponent. Bombers never fire on their own: they only bomb the square a player
// (or the AI) picked, via `deliver()`. Helicopters machine-gun enemy aircraft and guns between deliveries.
// Edge guns aim 50% at enemy planes, 20% at already-attacked squares, 30% at enemy guns and helicopters.
// Machine guns carry MG_AMMO rounds, refilled only on the player's turn (`reload()`). Nothing here can hit
// an unshot square, so ships are only sunk by the players' own shots. Each side has its own colour theme.

import {
  playBomber,
  playExplosion,
  playHelicopter,
  playKill,
  playMachineGun,
  playMissile,
  playPop,
  playSplash,
} from './sound'

type Pt = { x: number; y: number }
export type Team = 'player' | 'enemy'
type Kind = 'heli' | 'gripen' | 'b2' | 'b52'
type BoardId = 'own' | 'enemy'

/** Aircraft that can deliver a player's or the AI's aimed shot instead of the cannon. */
export type Delivery = 'heli' | 'b2' | 'b52'
export const DELIVERIES: Delivery[] = ['heli', 'b2', 'b52']
const BOMB_FALL_S = 0.6
const MISSILE_S = 0.45

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
  /** Release a weapon at `to` at time `at`. `quiet` skips the impact effect (the board plays its own). */
  strike?: { at: number; to: Pt; hit: boolean; dropped?: boolean; quiet?: boolean; weapon?: 'bomb' | 'missile' }
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
  x: number
  y: number
  hp: number
  /** Machine-gun rounds left this turn. */
  ammo: number
  /** Destroyed until this time, then a replacement rolls in. */
  downUntil?: number
}

/** Where a weapon is pointed, and the aircraft or gun it can damage there. */
interface Aim {
  to: Pt
  plane?: Plane
  gun?: Gun
}

interface Shot {
  kind: 'tracer' | 'missile' | 'bomb'
  from: Pt
  to: Pt
  t0: number
  dur: number
  target?: Plane
  gun?: Gun
  team: Team
  hitChance: number
  /** Bullets' worth of damage on a hit. */
  power: number
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

const SPEED: Record<Kind, number> = { heli: 0, gripen: 330, b2: 110, b52: 95 }
/** Bullets needed to bring each aircraft down (a missile or bomb counts as 3). */
const HP: Record<Kind, number> = { heli: 10, gripen: 6, b2: 3, b52: 8 }
/** Aircraft each side keeps in the air. */
const MG_AMMO = 5
/** Seconds a shot-down aircraft falls before it hits the water. */
const CRASH_S = 1.6
const GUN_HP = 3
const NAMES: Record<Kind, string> = { heli: 'HELICOPTER', gripen: 'GRIPEN', b2: 'B-2', b52: 'B-52' }
/** How long the big-screen replay of a shoot-down stays up. */
const KILLCAM_S = 2.4
/** Per-side theme for tracers, missiles and bombs: player blue, enemy red. */
const SHOT_COLORS: Record<Team, { tracer: string; core: string }> = {
  player: { tracer: '#8fd0ff', core: '#3e9bff' },
  enemy: { tracer: '#ff9a8a', core: '#ff3b30' },
}

const COLORS: Record<Team, { fill: string; line: string }> = {
  player: { fill: '#a9d2ff', line: '#1f5fb0' },
  enemy: { fill: '#ffb0a3', line: '#b0281a' },
}

/** Half outlines (nose pointing +x), mirrored across the x axis. Pods are engine/fuel tank dots. */
const SHAPES: Record<Exclude<Kind, 'heli'>, { size: number; parts: number[][]; pods?: number[] }> = {
  gripen: { size: 0.95, parts: [[15, 0, 8, -1.6, -12, -1.6, -13, 0], [3, -1.6, -10, -9.5, -12, -9.5, -11, -1.6], [9, -1.6, 6, -5, 5, -5, 6, -1.6]] },
  // Flying wing with the sawtooth trailing edge.
  b2: { size: 1.5, parts: [[14, 0, -5, -26, -9, -24, -4, -17, -10, -10, -5, -5, -9, 0]] },
  // Long fuselage, swept wings with eight engines, tall tail.
  b52: {
    size: 1.6,
    parts: [[18, 0, 14, -1.8, -16, -1.8, -18, 0], [6, -1.8, -6, -24, -9, -24, -3, -1.8], [-13, -1.8, -16, -8, -18, -8, -17, -1.8]],
    pods: [-1, -8, -3.5, -13, -6, -18, -8, -22],
  },
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]
const lerp = (a: Pt, b: Pt, u: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u })
const centerOf = (r: DOMRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
const homeBoard = (team: Team): BoardId => (team === 'player' ? 'own' : 'enemy')
const targetBoard = (team: Team): BoardId => (team === 'player' ? 'enemy' : 'own')

/** +1 if the team flies left to right (player, whose board is on the left), -1 for the enemy. */
const forward = (team: Team) => (team === 'player' ? 1 : -1)

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
  private killcam: { team: Team; at: number; plane?: Plane; gun?: Gun } | null = null
  private bubbles: { x: number; y: number; t0: number; dur: number; r: number }[] = []
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
    addEventListener('resize', this.resize)
    const t = this.now()
    for (const team of ['player', 'enemy'] as Team[]) {
      for (const [kind, f] of [['mg', 0.2], ['mg', 0.7]] as const)
        this.guns.push({ team, kind, f: f + rand(-0.05, 0.05), v: rand(-0.025, 0.025), aim: 0, nextFire: t + rand(1, 3), fired: 0, x: 0, y: 0, hp: GUN_HP, ammo: MG_AMMO })
      this.next[`heli-${team}`] = t + rand(0.3, 1.5)
      this.next[`b2-${team}`] = t + rand(1, 3)
      this.next[`b52-${team}`] = t + rand(3, 6)
    }
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    removeEventListener('resize', this.resize)
  }

  /** Player's turn again: every machine gun gets a fresh MG_AMMO rounds. */
  reload() {
    for (const g of this.guns) g.ammo = MG_AMMO
  }

  /**
   * Delivers an aimed shot with the side's own helicopter, B-2 or B-52: the helicopter swoops to the
   * board edge and fires a missile, a bomber makes a run toward the opponent's side and drops on the
   * square. Resolves at impact, `ms` from now. Returns null when that bomber is already past the square
   * (it never turns back), so the caller can use the cannon instead.
   */
  deliver(by: Delivery, team: Team, board: BoardId, r: number, c: number, ms: number): Promise<void> | null {
    const t = this.now()
    const hitAt = ms / 1000
    const to = cellCenter(board, r, c)
    const grid = gridRect(board)
    const impact = () => new Promise<void>((resolve) => setTimeout(resolve, ms))
    if (!to || !grid) return impact()
    const flying = this.planes.find((p) => p.team === team && p.kind === by && !p.down)
    const ahead = (p: Plane) => (p.x - to.x) * forward(team) > 0
    if (by !== 'heli' && flying && ahead(flying)) return null
    const plane = flying ?? this.newPlane(by, team, t, this.entry(team, to.y))
    plane.born = t
    if (by === 'heli') {
      const fire = Math.max(0.2, hitAt - MISSILE_S)
      Object.assign(plane, this.heliRoute(board, team, { x: plane.x, y: plane.y }, to.y, fire, rand(10, 16)))
      plane.nextFire = t + hitAt + 0.5
      plane.strike = { at: t + fire, to, hit: false, quiet: true, weapon: 'missile' }
      this.sfx('heli', 1, playHelicopter)
    } else {
      const drop = Math.max(0.2, hitAt - BOMB_FALL_S)
      const dir = { x: forward(team), y: rand(-0.25, 0.25) }
      const v = SPEED[by] * this.scale() * 2.5
      const release = { x: to.x - dir.x * v * BOMB_FALL_S * 0.5, y: to.y - dir.y * v * BOMB_FALL_S * 0.5 }
      const from = { x: plane.x, y: plane.y }
      const exitX = team === 'player' ? this.w + 80 : -80
      const out = Math.abs(exitX - release.x) / v
      plane.life = drop + out
      plane.route = (age) =>
        age < drop
          ? lerp(from, release, age / drop)
          : { x: release.x + dir.x * v * (age - drop), y: release.y + dir.y * v * (age - drop) }
      plane.strike = { at: t + drop, to: { x: to.x + rand(-3, 3), y: to.y + rand(-3, 3) }, hit: false, quiet: true }
      this.sfx('bomber', 0, playBomber)
    }
    return impact()
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

    for (const g of this.guns) {
      const r = rects[homeBoard(g.team)]
      if (!r) continue
      if (g.downUntil) {
        if (Math.random() < dt * 4) this.puff('smoke', g.x + rand(-3, 3), g.y, 1.2, 6)
        if (t < g.downUntil) continue
        g.downUntil = undefined
        g.hp = GUN_HP
      }
      if (Math.random() < dt * 0.3) g.v = -g.v
      g.f += g.v * dt
      Object.assign(g, perimeter(r, g.f, 14))
      if (t >= g.nextFire) this.gunFire(g, t)
    }

    for (const p of this.planes) {
      if (p.down) {
        const k = t - p.down.at
        p.x += p.down.vx * dt
        p.y += p.down.vy * dt
        p.heading += p.down.spin * dt
        if (Math.random() < 0.6) this.puff('smoke', p.x, p.y, 0.9, 6)
        if (k > CRASH_S) {
          this.puff('blast', p.x, p.y, 0.6, 18)
          this.puff('splash', p.x, p.y, 0.8, 16)
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
        const { to, hit, quiet, weapon = 'bomb' } = p.strike
        if (weapon === 'missile') this.sfx('missile', 0.2, playMissile)
        this.shots.push({
          kind: weapon,
          team: p.team,
          from: { x: p.x, y: p.y },
          to,
          t0: t,
          dur: weapon === 'missile' ? MISSILE_S : BOMB_FALL_S,
          hitChance: 0,
          power: 0,
          land: () => {
            if (quiet) this.puff('smoke', to.x, to.y, 0.8, 8)
            else if (hit) {
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
    // Crashed aircraft are removed the frame they hit the water.
    this.planes = this.planes.filter((p) => (p.down ? t - p.down.at <= CRASH_S : t - p.born < p.life))

    for (const s of this.shots) {
      if (s.kind === 'missile' && s.target && !s.target.down) s.to = { x: s.target.x, y: s.target.y }
      if (s.kind === 'missile' && s.gun && !s.gun.downUntil) s.to = { x: s.gun.x, y: s.gun.y }
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
      if (s.target && !s.target.down && Math.random() < s.hitChance) this.damage(s.target, t, s.power)
      else if (s.gun && !s.gun.downUntil && Math.random() < s.hitChance) this.damageGun(s.gun, t)
      else if (!s.land) this.puff(s.kind === 'tracer' ? 'flak' : 'blast', s.to.x, s.to.y, 0.35, s.kind === 'tracer' ? 5 : 12)
    }
    this.fx = this.fx.filter((f) => t - f.t0 < f.dur)
  }

  private spawn(t: number) {
    const slow = this.calm ? 2 : 1
    for (const team of ['player', 'enemy'] as Team[]) {
      for (const kind of ['heli', 'b2', 'b52'] as const) {
        const live = this.planes.some((p) => p.team === team && !p.down && p.kind === kind)
        const key = `${kind}-${team}`
        if (live || t < this.next[key]) continue
        this.next[key] = t + rand(1.5, 3) * slow
        if (kind === 'heli') this.spawnHeli(team, t)
        else this.spawnJet(kind, team, t)
      }
    }
  }

  /** Off-screen point on the team's home side (player: left, enemy: right). */
  private entry(team: Team, y = rand(0.15, 0.85) * this.h): Pt {
    return { x: team === 'player' ? -60 : this.w + 60, y }
  }

  private newPlane(kind: Kind, team: Team, t: number, at: Pt): Plane {
    const plane: Plane = {
      kind,
      team,
      born: t,
      life: 1,
      route: () => at,
      ...at,
      heading: forward(team) > 0 ? 0 : Math.PI,
      hp: HP[kind],
      nextFire: kind === 'heli' ? t + rand(0.8, 1.6) : Infinity,
    }
    this.planes.push(plane)
    return plane
  }

  /** Bomber crossing the sky toward the opponent's side, from one edge to the other. */
  private spawnJet(kind: Kind, team: Team, t: number) {
    const from = this.entry(team)
    const to = { x: team === 'player' ? this.w + 60 : -60, y: Math.min(this.h * 0.9, Math.max(this.h * 0.1, from.y + rand(-0.25, 0.25) * this.h)) }
    const len = Math.hypot(to.x - from.x, to.y - from.y)
    const v = SPEED[kind] * this.scale()
    const bend = rand(-0.12, 0.12) * len
    const plane = this.newPlane(kind, team, t, from)
    plane.life = len / v
    plane.route = (age) => {
      const u = (age * v) / len
      const p = lerp(from, to, u)
      return { x: p.x, y: p.y + Math.sin(u * Math.PI) * bend }
    }
    this.sfx('bomber', 3, playBomber)
  }

  private spawnHeli(team: Team, t: number) {
    const plane = this.newPlane('heli', team, t, this.entry(team))
    Object.assign(plane, this.heliRoute(targetBoard(team), team, { x: plane.x, y: plane.y }, plane.y, 2.5, rand(14, 20)))
    this.sfx('heli', 2, playHelicopter)
  }

  /**
   * Helicopter: flies from `from` to the near edge of the opponent's board at height `y`, sweeps
   * slowly across it, then leaves off the far side. It only ever moves toward the opponent.
   */
  private heliRoute(board: BoardId, team: Team, from: Pt, y: number, enter: number, stay: number): Pick<Plane, 'route' | 'life'> {
    const dir = forward(team)
    const r = gridRect(board)
    const ahead = (x: number) => (dir > 0 ? Math.max(from.x, x) : Math.min(from.x, x))
    const nearX = ahead(r ? (dir > 0 ? r.left - 18 : r.right + 18) : this.w / 2)
    const farX = dir > 0 ? Math.max(nearX, r ? r.right : nearX) : Math.min(nearX, r ? r.left : nearX)
    const exitX = dir > 0 ? this.w + 80 : -80
    const sway = (r?.height ?? this.h) * 0.12
    const bob = rand(0.4, 0.7)
    const leave = 2.5
    const ease = (u: number) => u * u * (3 - 2 * u)
    const sweep = (age: number): Pt => {
      const u = Math.min(1, (age - enter) / stay)
      return { x: nearX + (farX - nearX) * u, y: y + Math.sin((age - enter) * bob) * sway }
    }
    return {
      life: enter + stay + leave,
      route: (age) => {
        if (age < enter) return lerp(from, { x: nearX, y }, ease(age / enter))
        if (age < enter + stay) return sweep(age)
        const p = sweep(enter + stay)
        return lerp(p, { x: exitX, y: p.y }, ease((age - enter - stay) / leave))
      },
    }
  }

  private onScreen = (p: Plane) => p.x > -20 && p.y > -20 && p.x < this.w + 20 && p.y < this.h + 20

  /** Live, on-screen enemy aircraft: helicopters or everything else. */
  private foePlanes(team: Team, helis: boolean): Plane[] {
    return this.planes.filter((p) => p.team !== team && !p.down && this.onScreen(p) && (p.kind === 'heli') === helis)
  }

  private foeGuns(team: Team): Gun[] {
    return this.guns.filter((g) => g.team !== team && !g.downUntil && (g.x || g.y))
  }

  /** One of the three closest units, so fire spreads out a little. */
  private aimAt(from: Pt, units: (Plane | Gun)[]): Aim | null {
    if (!units.length) return null
    const near = [...units].sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))
    const u = pick(near.slice(0, 3))
    return 'route' in u ? { to: { x: u.x, y: u.y }, plane: u } : { to: { x: u.x, y: u.y }, gun: u }
  }

  private spotAim = (to: Pt | null): Aim | null => (to ? { to } : null)

  /** Edge guns: 50% enemy planes, 20% already-attacked squares, 30% enemy guns and helicopters. */
  private gunAim(g: Gun): Aim | null {
    const roll = Math.random()
    const units = roll < 0.5 ? this.foePlanes(g.team, false) : roll < 0.7 ? [] : [...this.foeGuns(g.team), ...this.foePlanes(g.team, true)]
    return this.aimAt(g, units) ?? this.spotAim(attackedSpot(targetBoard(g.team)))
  }

  /** Helicopters machine-gun enemy aircraft and guns. Bombers only drop on picked squares (`deliver`). */
  private planeFire(p: Plane, t: number) {
    if (p.kind !== 'heli') return void (p.nextFire = Infinity)
    p.nextFire = t + rand(1.1, 2.2)
    const aim = this.aimAt(p, [...this.foePlanes(p.team, false), ...this.foePlanes(p.team, true), ...this.foeGuns(p.team)])
    if (aim) this.burst(p, p.team, aim, t)
  }

  private gunFire(g: Gun, t: number) {
    const aim = this.gunAim(g)
    g.nextFire = t + (g.kind === 'mg' ? rand(1.2, 2.4) : rand(3, 5))
    if (!aim || (g.kind === 'mg' && g.ammo <= 0)) return
    g.aim = Math.atan2(aim.to.y - g.y, aim.to.x - g.x)
    g.fired = t
    if (g.kind === 'mg') g.ammo -= this.burst(g, g.team, aim, t, g.ammo)
    else this.missile({ x: g.x, y: g.y }, g.team, aim, t, 0.5)
  }

  /** Fires `rounds` bullets; each one that hits does 1 damage. Returns the rounds used. */
  private burst(from: Pt, team: Team, aim: Aim, t: number, rounds = 6): number {
    const start = { x: from.x, y: from.y }
    const d = Math.hypot(aim.to.x - start.x, aim.to.y - start.y)
    const spread = aim.plane || aim.gun ? 3 : 6
    for (let i = 0; i < rounds; i++) {
      this.shots.push({
        kind: 'tracer',
        team,
        from: start,
        to: { x: aim.to.x + rand(-spread, spread), y: aim.to.y + rand(-spread, spread) },
        t0: t + i * 0.07,
        dur: d / 900 + 0.05,
        target: aim.plane,
        gun: i === rounds - 1 ? aim.gun : undefined,
        hitChance: 0.45,
        power: 1,
      })
    }
    this.sfx('mg', 0.35, () => playMachineGun(rounds))
    return rounds
  }

  private missile(from: Pt, team: Team, aim: Aim, t: number, hitChance: number) {
    const { to } = aim
    const d = Math.hypot(to.x - from.x, to.y - from.y)
    this.shots.push({ kind: 'missile', team, from, to, t0: t, dur: Math.max(0.4, d / 520), target: aim.plane, gun: aim.gun, hitChance, power: 3 })
    this.sfx('missile', 0.4, playMissile)
  }

  private damage(p: Plane, t: number, power = 1) {
    p.hp -= power
    this.puff('flak', p.x, p.y, 0.4, 10)
    if (p.hp > 0) return
    const v = p.kind === 'heli' ? 30 : SPEED[p.kind] * this.scale() * 0.5
    p.down = { at: t, vx: Math.cos(p.heading) * v, vy: Math.sin(p.heading) * v + 20, spin: rand(2, 5) * pick([-1, 1]) }
    this.puff('blast', p.x, p.y, 0.6, 20)
    this.drama({ team: p.team, at: t, plane: p })
  }

  private drama(cam: NonNullable<AirShow['killcam']>) {
    if (this.killcam && cam.at - this.killcam.at < KILLCAM_S + 1) return this.sfx('pop', 0.2, playPop)
    this.killcam = cam
    playKill()
    if (!this.calm)
      document.getElementById('root')?.animate(
        [0, 1, 2, 3, 4, 5, 6].map((i) => ({ transform: i === 6 ? 'none' : `translate(${rand(-9, 9)}px, ${rand(-7, 7)}px)` })),
        { duration: 500, easing: 'ease-out' },
      )
  }

  private damageGun(g: Gun, t: number) {
    g.hp -= 1
    this.puff('flak', g.x, g.y, 0.4, 10)
    if (g.hp > 0) return
    g.downUntil = t + rand(5, 8)
    this.puff('blast', g.x, g.y, 0.7, 22)
    this.drama({ team: g.team, at: t, gun: g })
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
    this.drawBubbles(t)
    for (const f of this.fx) if (f.kind === 'smoke') this.drawFx(f, t)
    for (const g of this.guns) this.drawGun(g, t)
    for (const s of this.shots) if (t >= s.t0) this.drawShot(s, t)
    const s = this.scale() * 1.25
    for (const p of this.planes) this.drawPlane(p, t, s, true)
    for (const p of this.planes) this.drawPlane(p, t, s, false)
    for (const p of this.planes) this.drawHealth(p, s)
    for (const f of this.fx) if (f.kind !== 'smoke') this.drawFx(f, t)
    if (this.killcam) this.drawKillcam(t)
  }

  /** Bubbles rising to the surface of both boards and popping. */
  private drawBubbles(t: number) {
    const { ctx } = this
    if (!this.calm && this.bubbles.length < 60)
      for (const board of ['own', 'enemy'] as BoardId[]) {
        const r = gridRect(board)
        if (r && Math.random() < 0.25)
          this.bubbles.push({ x: rand(r.left, r.right), y: rand(r.top, r.bottom), t0: t, dur: rand(1, 2.2), r: rand(1.2, 3.2) * this.scale() })
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

  /** Replay of a shoot-down over the loser's board: flash, the wreck tumbling in flames, and a headline. */
  private drawKillcam(t: number) {
    const { ctx } = this
    const { plane, gun, team, at } = this.killcam!
    const area = gridRect(team === 'player' ? 'own' : 'enemy')
    const zone = area
      ? { x: area.left, y: area.top, w: area.width, h: area.height }
      : { x: 0, y: 0, w: this.w, h: this.h }
    const k = (t - at) / KILLCAM_S
    if (k >= 1) {
      this.killcam = null
      return
    }
    if (k < 0.08) {
      ctx.fillStyle = `rgb(255 245 220 / ${0.7 * (1 - k / 0.08)})`
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h)
    }
    const pop = Math.min(1, k / 0.1)
    const fade = k > 0.85 ? (1 - k) / 0.15 : 1
    const bw = Math.min(zone.w * 0.96, 440) * (0.7 + 0.3 * pop)
    const bh = bw * 0.5
    const mid = zone.x + zone.w / 2
    const bx = mid - bw / 2
    const by = Math.max(8, zone.y + zone.h * 0.12)
    ctx.save()
    ctx.globalAlpha = fade
    ctx.fillStyle = 'rgb(0 0 0 / 0.35)'
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h)
    ctx.beginPath()
    ctx.roundRect(bx, by, bw, bh, 10)
    const sky = ctx.createLinearGradient(0, by, 0, by + bh)
    sky.addColorStop(0, '#1a2a44')
    sky.addColorStop(1, '#3a2418')
    ctx.fillStyle = sky
    ctx.fill()
    ctx.save()
    ctx.clip()
    // The aircraft spins and drops through the frame, trailing fire and smoke.
    const cx = bx + bw * (0.3 + 0.4 * k)
    const cy = by + bh * (0.3 + 0.5 * k * k)
    for (let i = 0; i < 10; i++) {
      const back = i * 0.035
      const r = bw * (0.04 + i * 0.014)
      const g = ctx.createRadialGradient(cx - bw * back, cy - bh * back * 0.8, 0, cx - bw * back, cy - bh * back * 0.8, r)
      g.addColorStop(0, i < 4 ? 'rgb(255 220 120 / 0.9)' : 'rgb(120 110 100 / 0.5)')
      g.addColorStop(1, 'rgb(80 60 50 / 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx - bw * back, cy - bh * back * 0.8, r, 0, Math.PI * 2)
      ctx.fill()
    }
    if (plane) this.drawPlane({ ...plane, x: cx, y: cy, heading: plane.heading + k * 9, down: undefined }, t, bw / 110, false)
    if (gun) {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(bw / 90 / this.scale(), bw / 90 / this.scale())
      this.drawGun({ ...gun, x: 0.01, y: 0, aim: gun.aim + k * 9, downUntil: undefined }, t)
      ctx.restore()
    }
    const burst = Math.max(0, 1 - Math.abs(k - 0.12) / 0.12)
    if (burst > 0) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, bw * 0.3 * burst)
      g.addColorStop(0, 'rgb(255 250 220 / 0.95)')
      g.addColorStop(0.4, 'rgb(255 160 40 / 0.8)')
      g.addColorStop(1, 'rgb(200 40 10 / 0)')
      ctx.fillStyle = g
      ctx.fillRect(bx, by, bw, bh)
    }
    ctx.fillStyle = 'rgb(255 255 255 / 0.05)'
    for (let y = by; y < by + bh; y += 4) ctx.fillRect(bx, y, bw, 1)
    ctx.restore()
    ctx.lineWidth = 3
    ctx.strokeStyle = team === 'enemy' ? '#ffd36b' : '#ff5a3c'
    ctx.stroke()
    ctx.font = `700 ${Math.round(bw / 26)}px system-ui, sans-serif`
    ctx.fillStyle = Math.floor(t * 3) % 2 ? '#ff3b30' : '#ff8a80'
    ctx.fillText('● REPLAY', bx + 10, by + bw / 20)
    const what = plane ? NAMES[plane.kind] : gun?.kind === 'mg' ? 'MACHINE GUN' : 'LAUNCHER'
    const headline = team === 'enemy' ? `ENEMY ${what} DESTROYED!` : `OUR ${what} IS DOWN!`
    ctx.font = `900 ${Math.round(bw / 15)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgb(0 0 0 / 0.8)'
    const ty = by + bh + bw / 11
    ctx.strokeText(headline, mid, ty)
    ctx.fillStyle = team === 'enemy' ? '#ffd36b' : '#ff6a50'
    ctx.fillText(headline, mid, ty, zone.w)
    ctx.restore()
  }

  /** Small health bar above each live aircraft. */
  private drawHealth(p: Plane, s: number) {
    if (p.down || !this.onScreen(p)) return
    const { ctx } = this
    const k = Math.max(0, p.hp / HP[p.kind])
    const w = 28 * s
    const x = p.x - w / 2
    const y = p.y - (p.kind === 'heli' ? 30 : p.kind === 'gripen' ? 20 : 34) * s
    ctx.fillStyle = COLORS[p.team].line
    ctx.fillRect(x - 1.5, y - 1.5, w + 3, 6)
    ctx.fillStyle = 'rgb(0 0 0 / 0.7)'
    ctx.fillRect(x, y, w, 3)
    ctx.fillStyle = k > 0.6 ? '#4cd964' : k > 0.3 ? '#ffcc00' : '#ff3b30'
    ctx.fillRect(x, y, w * k, 3)
  }

  private drawPlane(p: Plane, t: number, s: number, shadow: boolean) {
    const { ctx } = this
    const size = (p.kind === 'heli' ? 1.5 : SHAPES[p.kind].size) * s * (p.down ? Math.max(0.4, 1 - (t - p.down.at) / 2) : 1)
    const alt = p.kind === 'heli' ? 6 : p.kind === 'gripen' ? 14 : 22
    ctx.save()
    ctx.translate(p.x + (shadow ? alt * s : 0), p.y + (shadow ? alt * 1.3 * s : 0))
    ctx.rotate(p.heading)
    ctx.scale(size, size)
    const { fill, line } = COLORS[p.team]
    ctx.fillStyle = shadow ? 'rgb(0 0 0 / 0.22)' : fill
    ctx.strokeStyle = line
    ctx.lineWidth = 1.2 / size
    if (p.kind === 'heli') {
      // Fuselage, tail boom and fin; skids, canopy and spinning rotors on top.
      ctx.beginPath()
      ctx.ellipse(2, 0, 8, 4.5, 0, 0, Math.PI * 2)
      ctx.rect(-20, -1.2, 15, 2.4)
      ctx.rect(-21.5, -4.5, 3, 9)
      ctx.fill()
      if (!shadow) {
        ctx.stroke()
        ctx.strokeStyle = line
        ctx.lineWidth = 1.4 / size
        ctx.beginPath()
        for (const y of [-5.5, 5.5]) {
          ctx.moveTo(-5, y)
          ctx.lineTo(9, y)
        }
        ctx.stroke()
        ctx.fillStyle = 'rgb(140 200 255 / 0.85)'
        ctx.beginPath()
        ctx.ellipse(6.5, 0, 3, 3, 0, 0, Math.PI * 2)
        ctx.fill()
        const a = t * 28
        ctx.strokeStyle = 'rgb(30 35 45 / 0.85)'
        ctx.lineWidth = 1.8 / size
        ctx.beginPath()
        for (const k of [0, Math.PI / 2]) {
          ctx.moveTo(1 + Math.cos(a + k) * 16, Math.sin(a + k) * 16)
          ctx.lineTo(1 - Math.cos(a + k) * 16, -Math.sin(a + k) * 16)
        }
        ctx.moveTo(-20 + Math.cos(a * 1.5) * 4, -5 + Math.sin(a * 1.5) * 1.5)
        ctx.lineTo(-20 - Math.cos(a * 1.5) * 4, -5 - Math.sin(a * 1.5) * 1.5)
        ctx.stroke()
        ctx.fillStyle = 'rgb(220 230 240 / 0.15)'
        ctx.beginPath()
        ctx.arc(1, 0, 16, 0, Math.PI * 2)
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
        // Afterburner flicker (the stealthy B-2 has none).
        if (p.kind === 'gripen') {
          ctx.fillStyle = `rgb(255 ${150 + Math.random() * 80} 60 / 0.8)`
          ctx.beginPath()
          ctx.ellipse(-15, 0, 2 + Math.random() * 1.5, 1, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    ctx.restore()
  }

  private drawGun(g: Gun, t: number) {
    if (!g.x && !g.y) return
    const { ctx } = this
    const s = this.scale()
    if (g.downUntil) {
      ctx.fillStyle = '#2a2420'
      ctx.beginPath()
      ctx.arc(g.x, g.y, 5 * s, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    const { fill, line } = COLORS[g.team]
    ctx.save()
    ctx.translate(g.x, g.y)
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
      ctx.strokeStyle = SHOT_COLORS[s.team].tracer
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
      ctx.fillStyle = SHOT_COLORS[s.team].core
      ctx.beginPath()
      ctx.arc(p.x, p.y, 1.3 * k, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const u = Math.min(1, (t - s.t0) / s.dur)
      ctx.fillStyle = '#1b1f24'
      ctx.strokeStyle = SHOT_COLORS[s.team].tracer
      ctx.lineWidth = 1.5
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
