import { type ReactNode, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { SHOT_MS } from './artillery'
import { FleetStatus } from './components/FleetStatus'
import { Grid } from './components/Grid'
import { SeaLayer } from './components/SeaLayer'
import { strike } from './strikes'
import { LeaderboardDialog, LeaderboardTable } from './components/Leaderboard'
import { type Level, LEVELS, aiMode, chooseShot } from './game/ai'
import {
  type Board,
  type Coord,
  type Orientation,
  type Ship,
  FLEET,
  canPlace,
  fire,
  placeShip,
  randomBoard,
  removeShip,
  sameCoord,
  shipAt,
  shipCells,
} from './game/board'
import { fleetPlaced, initialState, reducer } from './game/game'
import { knowledgeOf, normalize, probabilityGrid } from './game/probability'
import { healthOf } from './game/raid'
import { computeScore, pct } from './game/score'
import {
  type Special,
  type Weapon,
  WEAPON_INFO,
  WEAPON_ORDER,
  aiHeal,
  aiWeapon,
  canHeal,
  crateSpot,
  footprint,
  onCrate,
  relocation,
} from './game/weapons'
import { type ScoreEntry, saveName, savedName, submitScore } from './leaderboard'
import { isMuted, playExplosion, playReward, playSplash, setMuted, unlockAudio } from './sound'
import './App.css'
import type { CSSProperties } from 'react'

/** Pause between the player's impact and the enemy starting to aim. */
const AI_PAUSE_MS = 250

type Drag = { id: string; grab: number; orientation: Orientation; source: 'picker' | 'ship'; x0: number; y0: number; moved: boolean }


/** One sound for a whole volley: the biggest result among the squares hit. */
function playShotSound(board: Board, cells: Coord[]) {
  let worst = 'miss'
  for (const p of cells) {
    if (board.shots[p.r][p.c] !== null) continue
    const result = fire(board, p)
    board = result.board
    if (result.outcome === 'sunk' || (result.outcome === 'hit' && worst === 'miss')) worst = result.outcome
  }
  if (worst === 'miss') playSplash()
  else playExplosion(worst === 'sunk')
}

/** Squares to highlight while aiming a weapon; the machine gun shows both possible rows. */
function aimArea(weapon: Weapon, { r, c }: Coord): Coord[] {
  if (weapon === 'missile') return []
  const out: Coord[] = []
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) if (weapon !== 'mg' || !dr || !dc) out.push({ r: r + dr, c: c + dc })
  return out
}

/** The own-board cell under a screen point, looking through ship sprites. */
function cellUnder(x: number, y: number): Coord | null {
  const el = document.elementsFromPoint(x, y).find((e) => e.matches('[data-board="own"] [data-cell]'))
  const key = (el as HTMLElement | undefined)?.dataset.cell
  if (!key) return null
  const [r, c] = key.split('-').map(Number)
  return { r, c }
}

const anchorFor = (cell: Coord, d: Pick<Drag, 'grab' | 'orientation'>): Coord =>
  d.orientation === 'H' ? { r: cell.r, c: cell.c - d.grab } : { r: cell.r - d.grab, c: cell.c }

function HealthBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value * 100)
  return (
    <span className={`health ${percent <= 30 ? 'low' : ''}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span className="health-fill" style={{ width: `${percent}%` }} />
      <b>{percent}%</b>
    </span>
  )
}

const WEAPON_ICON: Record<Weapon, string> = { missile: '🚀', nuke: '☢️', mg: '🔫', b52: '✈️' }

/** One side's weapons. The player's can be picked; the enemy's light up when it fires one. */
function ArsenalBar({
  side,
  arsenal,
  active,
  onPick,
  children,
}: {
  side: 'player' | 'enemy'
  arsenal: Record<Special, number>
  active: Weapon | null
  onPick?: (w: Weapon) => void
  children?: ReactNode
}) {
  return (
    <div className={`weapon-bar bar-${side}`} role={onPick ? 'radiogroup' : 'group'} aria-label={side === 'player' ? 'Your weapons' : 'Enemy weapons'}>
      {WEAPON_ORDER.map((w) => {
        const left = w === 'missile' ? Infinity : arsenal[w as Special]
        return (
          <button
            key={w}
            type="button"
            role={onPick ? 'radio' : undefined}
            aria-checked={onPick ? active === w : undefined}
            aria-label={`${WEAPON_INFO[w].name}, ${left === Infinity ? 'unlimited' : `${left} left`}`}
            className={`weapon weapon-${w} ${active === w ? 'on' : ''} ${left ? '' : 'empty'}`}
            disabled={!left || !onPick}
            title={`${WEAPON_INFO[w].name}: ${WEAPON_INFO[w].effect}`}
            onClick={() => onPick?.(w)}
          >
            <span className="weapon-icon" aria-hidden="true">
              {WEAPON_ICON[w]}
            </span>
            <span className="weapon-name">{WEAPON_INFO[w].name}</span>
            <small>{left === Infinity ? '∞' : `×${left}`}</small>
          </button>
        )
      })}
      {children}
    </div>
  )
}

const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
  x: (i * 37) % 100,
  delay: ((i * 13) % 20) / 10,
  hue: (i * 47) % 360,
  spin: (i % 2 ? 1 : -1) * (360 + ((i * 53) % 360)),
}))

/** Running totals for a campaign: levels 1 to 5 played in order, scores added up. */
type Campaign = { total: number; shots: number; hits: number; assisted: boolean }
const NEW_CAMPAIGN: Campaign = { total: 0, shots: 0, hits: 0, assisted: false }

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const [selectedId, setSelectedId] = useState<string | null>(FLEET[0].id)
  const [orientation, setOrientation] = useState<Orientation>('H')
  const [hover, setHover] = useState<Coord | null>(null)
  const [lastPlayerShot, setLastPlayerShot] = useState<Coord | null>(null)
  const [lastAiShot, setLastAiShot] = useState<Coord | null>(null)
  const [muted, setMutedState] = useState(isMuted)
  const [inFlight, setInFlight] = useState<'player' | 'ai' | null>(null)
  const [shade, setShade] = useState(false)
  const [assisted, setAssisted] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [showBoard, setShowBoard] = useState(false)
  const [name, setName] = useState(savedName)
  const [submitted, setSubmitted] = useState<ScoreEntry | null>(null)
  const [queued, setQueued] = useState<Coord | null>(null)
  const [campaign, setCampaign] = useState<Campaign>(NEW_CAMPAIGN)
  const [weapon, setWeapon] = useState<Weapon>('missile')
  const [aim, setAim] = useState<Coord | null>(null)
  /** Using the healing kit: the ship picked (if any) and the way it will face. */
  const [healing, setHealing] = useState<{ id: string | null; o: Orientation } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** Hearts bubbling up from a healing box that just dropped or was picked up. */
  const [burst, setBurst] = useState<{ board: 'player' | 'enemy'; at: Coord; key: number } | null>(null)
  /** The weapon the enemy is firing right now, lit up on its weapon bar. */
  const [aiFiring, setAiFiring] = useState<Weapon | null>(null)
  const [fullscreen, setFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)

  const { phase, player, enemy, turn, winner, level } = state
  const selected = FLEET.find((s) => s.id === selectedId) ?? null
  const nextUnplaced = (board: Board) => FLEET.find((s) => !board.ships.some((p) => p.id === s.id))?.id ?? null

  const playerRef = useRef(player)
  useEffect(() => {
    playerRef.current = player
  }, [player])
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])
  /** The round this level's healing box drops in. */
  const dropRound = useRef(0)
  /** Squares with a rocket on the way. */
  const pending = useRef<{ player: Coord | null; ai: Coord | null }>({ player: null, ai: null })
  const dragRef = useRef<Drag | null>(null)

  /** Animates a shot by either side with its weapon; resolves on impact. */
  const launch = useCallback(
    (side: 'player' | 'ai', weapon: Weapon, coord: Coord, cells: Coord[]) => strike(weapon, side === 'player' ? 'enemy' : 'own', coord, cells, SHOT_MS),
    [],
  )

  const hearts = useCallback((board: 'player' | 'enemy', at: Coord) => {
    playReward()
    setBurst({ board, at, key: Date.now() })
  }, [])

  useEffect(() => {
    if (!burst) return
    const t = setTimeout(() => setBurst(null), 1800)
    return () => clearTimeout(t)
  }, [burst])

  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  /** Once per level, at a random round, a healing box drops onto a random board. */
  const maybeDrop = useCallback(() => {
    const s = stateRef.current
    if (s.phase !== 'playing' || s.dropped || s.round < dropRound.current) return
    const side = Math.random() < 0.5 ? 'player' : 'enemy'
    const board = s[side]
    const open = board.shots.some((row, r) => row.some((v, c) => v === null && !shipAt(board, { r, c })))
    if (!open) return
    const at = crateSpot(board)
    dispatch({ type: 'drop', board: side, at })
    hearts(side, at)
    setNotice(side === 'enemy' ? '💝 A healing box fell into enemy waters! Shoot it to grab it!' : '💝 A healing box fell near your ships! Watch out, the enemy wants it too!')
  }, [hearts])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(t)
  }, [notice])

  // Enemy turn: a short pause, then aim and fire with the strategy for the chosen level.
  useEffect(() => {
    if (phase !== 'playing' || turn !== 'ai') return
    let cancelled = false
    const t = setTimeout(async () => {
      const s = stateRef.current
      if (s.kits.ai) {
        const heal = aiHeal(s.enemy)
        if (heal) {
          dispatch({ type: 'heal', side: 'ai', ...heal })
          setNotice(`The enemy used its healing kit: its ${FLEET.find((f) => f.id === heal.id)?.name} is repaired and has moved.`)
        }
      }
      const crate = s.crates.player
      // From level 2 the AI sometimes goes for the healing box when it has no ship to chase.
      const forCrate = crate && s.level > 1 && aiMode(s.ai) === 'hunt' && Math.random() < 0.3
      let coord = forCrate ? crate : chooseShot(s.ai, Math.random, s.level)
      const weapon = aiWeapon(s.ai, s.arsenal.ai, s.level)
      let cells = footprint(weapon, coord, s.player)
      pending.current.ai = coord
      setInFlight('ai')
      setAiFiring(weapon)
      await launch('ai', weapon, coord, cells)
      pending.current.ai = null
      if (cancelled) return
      const now = stateRef.current
      if (now.player.shots[coord.r][coord.c]) {
        coord = chooseShot(now.ai, Math.random, now.level)
        cells = [coord]
      }
      playShotSound(now.player, cells)
      setLastAiShot(coord)
      if (onCrate(cells, now.crates.player)) {
        hearts('player', now.crates.player!)
        setNotice('Oh no! The enemy grabbed the healing box!')
      }
      dispatch({ type: 'aiFire', coord, weapon, cells })
      setInFlight(null)
      setAiFiring(null)
      setTimeout(maybeDrop, 500)
    }, AI_PAUSE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
      setInFlight(null)
      setAiFiring(null)
    }
    // Reads the latest board through stateRef.
  }, [phase, turn, launch, hearts, maybeDrop])

  // R rotates the ship being placed.
  useEffect(() => {
    if (phase !== 'placement') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setOrientation((o) => (o === 'H' ? 'V' : 'H'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  function placeAt(id: string, start: Coord, o: Orientation): boolean {
    const def = FLEET.find((s) => s.id === id)
    const board = def && placeShip(playerRef.current, def, start, o)
    if (!def || !board) return false
    dispatch({ type: 'place', ship: def, start, orientation: o })
    setSelectedId(nextUnplaced(board))
    return true
  }

  /** Rotates a placed ship around its bow, shifting it along the new axis if it doesn't fit. */
  function rotateShip(id: string) {
    const ship = playerRef.current.ships.find((s) => s.id === id)
    if (!ship) return
    const [bow] = ship.cells
    const next: Orientation = ship.cells.length > 1 && ship.cells[1].r === bow.r ? 'V' : 'H'
    for (let k = 0; k < ship.length; k++) {
      const start = next === 'H' ? { r: bow.r, c: bow.c - k } : { r: bow.r - k, c: bow.c }
      if (placeAt(id, start, next)) return
    }
  }

  // Drag and drop (mouse and touch): from the ship list, or an already placed ship.
  useEffect(() => {
    if (!dragId) return
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return
      d.moved = true
      setSelectedId(d.id)
      setOrientation(d.orientation)
      const cell = cellUnder(e.clientX, e.clientY)
      setHover(cell && anchorFor(cell, d))
    }
    const end = (e: PointerEvent) => {
      const d = dragRef.current
      dragRef.current = null
      setDragId(null)
      if (!d) return
      if (d.moved) {
        const cell = e.type === 'pointerup' ? cellUnder(e.clientX, e.clientY) : null
        if (cell) placeAt(d.id, anchorFor(cell, d), d.orientation)
        setHover(null)
      } else if (d.source === 'ship' && e.type === 'pointerup') {
        rotateShip(d.id)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    // placeAt/rotateShip read the latest board through playerRef.
  }, [dragId])

  function beginDrag(e: ReactPointerEvent, d: Omit<Drag, 'x0' | 'y0' | 'moved'>) {
    if (e.button !== 0) return
    dragRef.current = { ...d, x0: e.clientX, y0: e.clientY, moved: false }
    setDragId(d.id)
  }

  function grabShip(ship: Ship, e: ReactPointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const vertical = ship.cells.length > 1 && ship.cells[1].r !== ship.cells[0].r
    const frac = vertical ? (e.clientY - rect.top) / rect.height : (e.clientX - rect.left) / rect.width
    const grab = Math.min(ship.length - 1, Math.max(0, Math.floor(frac * ship.length)))
    beginDrag(e, { id: ship.id, grab, orientation: vertical ? 'V' : 'H', source: 'ship' })
  }

  const healShip = healing?.id ? player.ships.find((p) => p.id === healing.id) : undefined
  const preview =
    healing && healShip && hover
      ? { cells: shipCells(hover, healShip.length, healing.o), valid: !!relocation(player, healShip, hover, healing.o) }
      : phase === 'placement' && selected && hover
      ? (() => {
          const cells = shipCells(hover, selected.length, orientation)
          return { cells, valid: canPlace(removeShip(player, selected.id), cells) }
        })()
      : null

  function handlePlacementClick(coord: Coord) {
    const existing = shipAt(player, coord)
    if (existing && existing.id !== selected?.id) {
      // Pick an already-placed ship back up to move it (keyboard path; pointer users drag).
      dispatch({ type: 'remove', id: existing.id })
      setSelectedId(existing.id)
      return
    }
    if (selected) placeAt(selected.id, coord, orientation)
  }

  function randomize() {
    dispatch({ type: 'setPlayerBoard', board: randomBoard() })
    setSelectedId(null)
  }

  function clearBoard() {
    dispatch({ type: 'reset' })
    setSelectedId(FLEET[0].id)
  }

  function start() {
    unlockAudio()
    const enemyBoard = randomBoard()
    dispatch({ type: 'start', enemy: enemyBoard, level })
    dropRound.current = 3 + Math.floor(Math.random() * 10)
    if (!document.fullscreenElement && matchMedia('(pointer: coarse)').matches) void enterFullscreen()
    setWeapon('missile')
    setHealing(null)
    setNotice(null)
    setLastAiShot(null)
    setLastPlayerShot(null)
    setQueued(null)
    setAssisted(shade)
    setSubmitted(null)
  }

  // A square tapped while waiting fires as soon as the turn comes back.
  useEffect(() => {
    if (!queued || phase !== 'playing' || turn !== 'player' || inFlight) return
    const t = setTimeout(() => {
      setQueued(null)
      void fireAt(queued)
    }, 0)
    return () => clearTimeout(t)
  })

  async function fireAt(coord: Coord) {
    if (phase !== 'playing' || healing || enemy.shots[coord.r][coord.c]) return
    unlockAudio()
    const busy = turn !== 'player' || inFlight || pending.current.player
    if (busy) {
      setQueued((q) => (q && sameCoord(q, coord) ? null : coord))
      return
    }
    const w = weapon !== 'missile' && state.arsenal.player[weapon] > 0 ? weapon : 'missile'
    const cells = footprint(w, coord, enemy)
    pending.current.player = coord
    setInFlight('player')
    setWeapon('missile')
    await launch('player', w, coord, cells)
    pending.current.player = null
    const s = stateRef.current
    if (s.phase !== 'playing' || s.enemy.shots[coord.r][coord.c]) return setInFlight(null)
    playShotSound(s.enemy, cells)
    setLastPlayerShot(coord)
    if (onCrate(cells, s.crates.enemy)) {
      hearts('enemy', s.crates.enemy!)
      setNotice('💖 You got the healing box! Tap ❤️ Heal to fix a ship.')
    }
    dispatch({ type: 'playerFire', coord, weapon: w, cells })
    setInFlight(null)
  }

  const myTurn = phase === 'playing' && turn === 'player' && !inFlight

  function healClick(coord: Coord) {
    if (!healing || !myTurn) return
    const ship = shipAt(player, coord)
    if (!healing.id || (ship && ship.id !== healing.id && canHeal(player, ship))) {
      if (ship && canHeal(player, ship)) setHealing({ id: ship.id, o: ship.cells.length > 1 && ship.cells[1].r !== ship.cells[0].r ? 'V' : 'H' })
      return
    }
    const picked = player.ships.find((p) => p.id === healing.id)
    const cells = picked && relocation(player, picked, coord, healing.o)
    if (!picked || !cells) return
    dispatch({ type: 'heal', side: 'player', id: picked.id, cells })
    setHealing(null)
    setHover(null)
    setNotice(`Your ${picked.name} is repaired and has moved.`)
  }

  /** Next level after a win (keeping the campaign totals), or a new campaign from level 1. */
  function playAgain() {
    const next = cleared && level < 5
    setCampaign(next ? totals : NEW_CAMPAIGN)
    dispatch({ type: 'reset' })
    dispatch({ type: 'setLevel', level: next ? ((level + 1) as Level) : 1 })
    if (next) dispatch({ type: 'setPlayerBoard', board: randomBoard() })
    setSelectedId(next ? null : FLEET[0].id)
    setHealing(null)
    setLastAiShot(null)
    setLastPlayerShot(null)
  }

  /** Seeing the shade at any point in a battle counts as assisted, even if it's turned off again. */
  function toggleShade() {
    if (!shade) setAssisted(true)
    setShade(!shade)
  }

  function toggleSound() {
    setMuted(!muted)
    setMutedState(!muted)
    if (muted) unlockAudio()
  }

  const heat = useMemo(() => {
    if (!shade || phase !== 'playing') return null
    const k = knowledgeOf(enemy)
    return normalize(probabilityGrid(k.grid, k.remaining))
  }, [shade, phase, enemy])

  const { shots: fired, hits } = state.tally.player
  const stats = { shots: fired, hits, accuracy: fired ? hits / fired : 0 }
  const score = computeScore({ accuracy: stats.accuracy, level, won: winner === 'player', assisted })
  const cleared = winner === 'player'
  /** The campaign ends on a loss or after beating level 5; only then does the total go on the leaderboard. */
  const campaignOver = !cleared || level === 5
  const totals: Campaign = {
    total: campaign.total + score,
    shots: campaign.shots + stats.shots,
    hits: campaign.hits + stats.hits,
    assisted: campaign.assisted || assisted,
  }
  const totalAccuracy = totals.shots ? totals.hits / totals.shots : 0

  function saveScore() {
    const trimmed = name.trim().slice(0, 20)
    if (!trimmed) return
    saveName(trimmed)
    setSubmitted(
      submitScore({ name: trimmed, score: totals.total, accuracy: totalAccuracy, level, shots: totals.shots, won: cleared && level === 5, assisted: totals.assisted }),
    )
  }

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen?.()
    } catch {
      // Not allowed or not supported (e.g. iPhone Safari).
    }
  }

  async function goLandscape() {
    try {
      await document.documentElement.requestFullscreen?.()
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')
    } catch {
      // Not supported (e.g. iOS): the overlay keeps asking the user to turn the phone.
    }
  }

  const mode = aiMode(state.ai)
  const levelInfo = LEVELS[level - 1]
  const status =
    phase === 'placement'
      ? fleetPlaced(player)
        ? `Ships ready! Level ${level}: beat ${levelInfo.name}!`
        : 'Tap the sea to put your ships, or press 🎲 Randomize. Drag a ship to move it, tap it to turn it.'
      : phase === 'over'
        ? winner === 'player'
          ? '🎉 You win! You sank every enemy ship!'
          : winner === 'draw'
            ? 'A draw! Both fleets sank together.'
            : 'Oh no! The enemy sank your ships. Try again!'
        : aiFiring
          ? `Watch out! The enemy is firing a ${WEAPON_INFO[aiFiring].name.toLowerCase()} ${WEAPON_ICON[aiFiring]}`
          : notice
            ? notice
            : healing
            ? healShip
              ? `Tap a safe spot for your ${healShip.name}.`
              : 'Tap a hurt ship to fix it.'
            : inFlight === 'player'
              ? 'Fire! 🔥'
              : turn === 'player'
                ? `Your turn! ${WEAPON_ICON[weapon]} Tap the red sea to fire your ${WEAPON_INFO[weapon].name.toLowerCase()}.`
                : 'Watch out! The enemy is aiming…'

  return (
    <main className={`app phase-${phase}`}>
      <div className="rotate-overlay" role="alertdialog" aria-label="Rotate your phone">
        <div className="rotate-phone" aria-hidden="true" />
        <p>Turn your phone sideways to play! 🔄</p>
        {'requestFullscreen' in document.documentElement && (
          <button type="button" onClick={goLandscape}>
            Play in landscape
          </button>
        )}
      </div>

      <header>
        <h1>
          <span aria-hidden="true">⚓</span> Battleship
        </h1>
        <div className="header-actions">
          {!fullscreen && 'requestFullscreen' in document.documentElement && (
            <button type="button" className="chip" onClick={enterFullscreen}>
              ⛶ Full screen
            </button>
          )}
          <button type="button" className="chip" onClick={() => setShowBoard(true)}>
            🏆 Leaderboard
          </button>
          <button type="button" className="chip sound-toggle" aria-pressed={!muted} onClick={toggleSound}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
              {muted ? (
                <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
              )}
            </svg>
            {muted ? 'Sound off' : 'Sound on'}
          </button>
        </div>
        <p className={`status ${phase === 'over' ? `status-${winner}` : ''}`} role="status" aria-live="polite">
          {status}
        </p>
      </header>

      {phase === 'placement' && (
        <section className="controls" aria-label="Fleet placement">
          <div className="actions">
            <button type="button" onClick={randomize}>
              🎲 Randomize
            </button>
            <button type="button" onClick={clearBoard}>
              🧹 Clear
            </button>
          </div>
          <p className="level-hint">
            Level {level} of 5: {levelInfo.strategy}. Score ×{level}. Win to move up a level; your scores add up and go on the leaderboard when
            the campaign ends.
            {campaign.total > 0 && ` Campaign total so far: ${campaign.total}.`}
          </p>
          <button type="button" className="primary start-btn" disabled={!fleetPlaced(player)} onClick={start}>
            ⚔️ Start battle!
          </button>
        </section>
      )}

      {phase === 'over' && cleared && (
        <div className="confetti" aria-hidden="true">
          {CONFETTI.map((p, i) => (
            <i key={i} style={{ '--x': `${p.x}%`, '--d': `${p.delay}s`, '--h': p.hue, '--spin': `${p.spin}deg` } as CSSProperties} />
          ))}
        </div>
      )}

      {phase === 'over' && (
        <section className="game-over" aria-label="Result">
          <h2 className={`winner-banner winner-${winner}`}>
            {cleared
              ? level === 5
                ? `🏆 Congratulations${name.trim() ? `, ${name.trim()}` : ''}! You beat all 5 levels.`
                : `Level ${level} cleared! Next up: level ${level + 1}, ${LEVELS[level].name}.`
              : `The enemy ${levelInfo.name} wins this time. Your campaign ends at level ${level}.`}
          </h2>
          <p className="lb-note">
            Your fleet {pct(healthOf(player))} · Enemy fleet {pct(healthOf(enemy))}
          </p>
          <div className="result-stats">
            <div>
              <b>{score}</b>
              <span>Level score</span>
            </div>
            <div>
              <b>{totals.total}</b>
              <span>Campaign total</span>
            </div>
            <div>
              <b>{pct(stats.accuracy)}</b>
              <span>
                Accuracy ({stats.hits}/{stats.shots})
              </span>
            </div>
            <div>
              <b>{level}</b>
              <span>{levelInfo.name}</span>
            </div>
          </div>
          {assisted && <p className="lb-note">Probability shade used: score halved.</p>}
          {campaignOver && !submitted ? (
            <form
              className="submit-score"
              onSubmit={(e) => {
                e.preventDefault()
                saveScore()
              }}
            >
              <input value={name} maxLength={20} placeholder="Your name" aria-label="Your name" onChange={(e) => setName(e.target.value)} />
              <button type="submit" disabled={!name.trim()}>
                Save to leaderboard
              </button>
            </form>
          ) : null}
          <LeaderboardTable highlight={submitted} />
          <button type="button" className="primary" onClick={playAgain}>
            {campaignOver ? 'New campaign from level 1' : `Next: level ${level + 1}`}
          </button>
        </section>
      )}

      <section className="boards">
        {phase === 'playing' && (
          <aside className="edge-bar edge-player">
            <span className="edge-title">
              Your weapons
              <br />
              fire at the enemy ➜
            </span>
            <ArsenalBar side="player" arsenal={state.arsenal.player} active={weapon} onPick={setWeapon}>
              {state.kits.player &&
                (healing ? (
                  <span className="kit-actions">
                    {healShip && (
                      <button type="button" className="kit-btn" onClick={() => setHealing({ ...healing, o: healing.o === 'H' ? 'V' : 'H' })}>
                        🔄 Turn
                      </button>
                    )}
                    <button type="button" className="kit-btn" onClick={() => setHealing(null)}>
                      ✖ Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="weapon kit-btn heal-ready"
                    disabled={!myTurn || !player.ships.some((p) => canHeal(player, p))}
                    title="Fix a hurt ship and move it"
                    onClick={() => setHealing({ id: null, o: 'H' })}
                  >
                    <span className="weapon-icon" aria-hidden="true">
                      ❤️
                    </span>
                    <span className="weapon-name">Heal</span>
                  </button>
                ))}
            </ArsenalBar>
          </aside>
        )}
        <div className="board-panel side-player">
          <h2>
            <span className="side-name">🔵 Your fleet</span>
            {phase !== 'placement' && <HealthBar value={healthOf(player)} label="Your fleet health" />}
          </h2>
          <div className="grid-wrap">
            <Grid
              board={player}
              label="Your board"
              showShips="all"
              interactive={phase === 'placement' || (!!healing && myTurn)}
              preview={preview}
              lastShot={lastAiShot}
              crate={phase === 'playing' ? state.crates.player : null}
              burst={burst?.board === 'player' ? burst : null}
              onCellClick={phase === 'placement' ? handlePlacementClick : healing ? healClick : undefined}
              onCellHover={(phase === 'placement' && !dragId) || healing ? setHover : undefined}
              onShipPointerDown={phase === 'placement' ? grabShip : undefined}
              draggingId={dragId}
            />
          </div>
          {phase !== 'placement' ? <FleetStatus board={player} title="Your ships" /> : <div />}
        </div>

        <div className="board-panel side-enemy">
          <h2>
            <span className="side-name">🔴 Enemy fleet</span>
            {phase !== 'placement' && <HealthBar value={healthOf(enemy)} label="Enemy fleet health" />}
            {phase !== 'placement' && (
              <span className={`ai-mode ai-${level === 1 ? 'hunt' : mode}`} title={levelInfo.strategy}>
                Lv {level} {levelInfo.name}
                {phase === 'playing' && `: ${level === 1 ? 'Random' : level === 5 && mode === 'hunt' ? 'Thinking' : mode === 'hunt' ? 'Hunting' : 'Targeting'}`}
              </span>
            )}
          </h2>
          <div className="grid-wrap">
            <Grid
              board={enemy}
              crate={phase === 'playing' ? state.crates.enemy : null}
              burst={burst?.board === 'enemy' ? burst : null}
              area={aim && myTurn ? aimArea(weapon, aim) : null}
              onCellHover={phase === 'playing' ? setAim : undefined}
              label="Enemy board"
              showShips={phase === 'over' ? 'all' : 'sunk'}
              variant="enemy"
              interactive={phase === 'playing'}
              queued={queued}
              lastShot={lastPlayerShot}
              onCellClick={fireAt}
              heat={heat}
            />
          </div>
          {phase !== 'placement' ? <FleetStatus board={enemy} title="Enemy ships" /> : <div />}
        </div>
        {phase === 'playing' && (
          <aside className="edge-bar edge-enemy">
            <span className="edge-title">⬅ Enemy weapons</span>
            <ArsenalBar side="enemy" arsenal={state.arsenal.ai} active={aiFiring}>
              {state.kits.ai && (
                <span className="weapon kit-btn enemy-kit" title="The enemy has a healing kit">
                  <span className="weapon-icon" aria-hidden="true">
                    ❤️
                  </span>
                  <span className="weapon-name">Heal</span>
                </span>
              )}
            </ArsenalBar>
          </aside>
        )}
      </section>
      {phase === 'playing' && (
        <div className="extras">
          <button
            type="button"
            className={`shade-toggle ${shade ? 'on' : ''}`}
            aria-pressed={shade}
            title="Orange glow where enemy ships are most likely, from the shots so far. Halves your score."
            onClick={toggleShade}
          >
            🔮 Hint glow {shade ? 'on' : 'off'}
          </button>
        </div>
      )}

      {phase !== 'over' && <SeaLayer />}
      {showBoard && <LeaderboardDialog onClose={() => setShowBoard(false)} />}
    </main>
  )
}
