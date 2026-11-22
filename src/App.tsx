import { type ReactNode, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { SHOT_MS } from './artillery'
import { useFitCell } from './fit'
import { canFullscreen, isFullscreen, isInstalled, onFullscreenChange, requestFullscreen } from './fullscreen'
import { FleetStatus } from './components/FleetStatus'
import { Grid } from './components/Grid'
import { SeaLayer } from './components/SeaLayer'
import { strike } from './strikes'
import { LeaderboardDialog, LeaderboardTable } from './components/Leaderboard'
import { LevelMap, RewardsDialog } from './components/Rewards'
import { LEVELS, aiMode, chooseShot } from './game/ai'
import {
  type Board,
  type Coord,
  type Orientation,
  type Ship,
  FLEET,
  canPlace,
  fire,
  isSunk,
  placeShip,
  randomBoard,
  removeShip,
  sameCoord,
  shipAt,
  shipCells,
} from './game/board'
import { armFleet, enemyFleetLevels, fleetBonus, isBoss, tierOf } from './game/fleet'
import { fleetPlaced, initialState, reducer } from './game/game'
import { knowledgeOf, normalize, probabilityGrid } from './game/probability'
import { healthOf } from './game/raid'
import { computeScore, pct } from './game/score'
import {
  BADGES,
  type ChestPrize,
  DAILY_LEVEL,
  type Progress,
  buySkin,
  comboBonus,
  dayKey,
  liveStreak,
  NEW_RUN,
  type Run,
  loadProgress,
  openChest,
  recordBattle,
  saveProgress,
  seededRng,
  starRow,
} from './game/rewards'
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
import { type ScoreEntry, flushPending, saveName, savedName, submitScore } from './leaderboard'
import { startMusic, stopMusic } from './music'
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
    if (result.outcome === 'sunk' || (result.outcome !== 'miss' && worst === 'miss')) worst = result.outcome === 'dent' ? 'hit' : result.outcome
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


export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ ...initialState(), level: tierOf(loadProgress().run.mission) }))
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
  const [weapon, setWeapon] = useState<Weapon>('missile')
  const [aim, setAim] = useState<Coord | null>(null)
  /** Using the healing kit: the ship picked (if any) and the way it will face. */
  const [healing, setHealing] = useState<{ id: string | null; o: Orientation } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** Hearts bubbling up from a healing box that just dropped or was picked up. */
  const [burst, setBurst] = useState<{ board: 'player' | 'enemy'; at: Coord; key: number } | null>(null)
  /** The weapon the enemy is firing right now, lit up on its weapon bar. */
  const [aiFiring, setAiFiring] = useState<Weapon | null>(null)
  const [progress, setProgressState] = useState<Progress>(loadProgress)
  const setProgress = useCallback((update: (p: Progress) => Progress) => {
    setProgressState((p) => {
      const next = update(p)
      saveProgress(next)
      return next
    })
  }, [])
  const [showRewards, setShowRewards] = useState(false)
  const [daily, setDaily] = useState(false)
  const campaign = progress.run
  const setCampaign = (run: Run) => setProgress((p) => ({ ...p, run }))
  /** Saving the score after a win ends the points run (the mission number stays). */
  const [banking, setBanking] = useState(false)
  const [combo, setCombo] = useState({ now: 0, best: 0, points: 0 })
  const [comboPop, setComboPop] = useState<{ n: number; key: number } | null>(null)
  const [reward, setReward] = useState<ReturnType<typeof recordBattle> | null>(null)
  const [chest, setChest] = useState<ChestPrize | null>(null)
  const recorded = useRef(false)
  const today = dayKey(new Date())
  const [fullscreen, setFullscreen] = useState(() => typeof document !== 'undefined' && isFullscreen())
  const [fullscreenTip, setFullscreenTip] = useState(false)
  const appRef = useRef<HTMLElement>(null)

  const { phase, player, enemy, turn, winner, level } = state
  const mission = daily ? DAILY_LEVEL : campaign.mission
  const boss = !daily && isBoss(mission)
  /** Changes after every enemy shot, so the enemy fires again while it keeps hitting. */
  const aiShots = state.tally.ai.shots
  const selected = FLEET.find((s) => s.id === selectedId) ?? null
  const nextUnplaced = (board: Board) => FLEET.find((s) => !board.ships.some((p) => p.id === s.id))?.id ?? null

  useEffect(() => {
    const upload = () => void flushPending()
    upload()
    window.addEventListener('online', upload)
    return () => window.removeEventListener('online', upload)
  }, [])

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

  useEffect(() => onFullscreenChange(() => setFullscreen(isFullscreen())), [])

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
  }, [phase, turn, aiShots, launch, hearts, maybeDrop])

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
    const fleet = enemyFleetLevels(daily ? 1 : mission)
    const enemyBoard = armFleet(randomBoard(daily ? seededRng(`daily-${today}`) : Math.random), fleet, boss ? 1 : 0)
    dispatch({ type: 'start', enemy: enemyBoard, level, bonus: progress.bonus, enemyBonus: fleetBonus(fleet) })
    if (progress.bonus) {
      const bonus = WEAPON_INFO[progress.bonus].name
      setProgress((p) => ({ ...p, bonus: null }))
      setTimeout(() => setNotice(`🎁 Lucky chest bonus: +1 ${bonus}!`), 0)
    }
    setCombo({ now: 0, best: 0, points: 0 })
    setComboPop(null)
    setReward(null)
    setChest(null)
    recorded.current = false
    dropRound.current = 3 + Math.floor(Math.random() * 10)
    if (!isFullscreen() && matchMedia('(pointer: coarse)').matches) void enterFullscreen()
    setWeapon('missile')
    setHealing(null)
    setNotice(null)
    setLastAiShot(null)
    setLastPlayerShot(null)
    setQueued(null)
    setAssisted(shade)
    setSubmitted(null)
  }

  // Stars, coins, badges and the daily streak are paid out once when a battle ends.
  useEffect(() => {
    if (phase !== 'over' || recorded.current) return
    recorded.current = true
    const { shots, hits } = state.tally.player
    const result = recordBattle(
      progress,
      {
        won: winner === 'player',
        accuracy: shots ? hits / shots : 0,
        level: mission,
        boss,
        bestCombo: combo.best,
        shipsLost: player.ships.filter((p) => isSunk(player, p)).length,
        daily,
      },
      today,
    )
    setProgress(() => result.progress)
    setReward(result)
  }, [phase, progress, state.tally, winner, mission, boss, combo.best, player, daily, today, setProgress])

  useEffect(() => {
    if (!comboPop) return
    const t = setTimeout(() => setComboPop(null), 1400)
    return () => clearTimeout(t)
  }, [comboPop])

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
    const struck = cells.some((p) => shipAt(s.enemy, p) && s.enemy.shots[p.r][p.c] === null)
    const n = struck ? combo.now + 1 : 0
    setCombo({ now: n, best: Math.max(combo.best, n), points: combo.points + comboBonus(n, mission) })
    if (n >= 2) setComboPop({ n, key: Date.now() })
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
    setProgress((p) => (p.badges.includes('healer') ? p : { ...p, badges: [...p.badges, 'healer'] }))
  }

  /** Turns the daily challenge on or off; the campaign level is put back afterwards. */
  function toggleDaily() {
    dispatch({ type: 'setLevel', level: daily ? tierOf(campaign.mission) : DAILY_LEVEL })
    setDaily(!daily)
  }

  function openLuckyChest() {
    const prize = openChest()
    setChest(prize)
    playReward()
    setProgress((p) => (prize.kind === 'coins' ? { ...p, coins: p.coins + prize.amount } : { ...p, bonus: prize.weapon }))
  }

  /** Next level after a win (keeping the campaign totals), or a new campaign from level 1. */
  function playAgain() {
    if (daily) {
      setDaily(false)
      dispatch({ type: 'reset' })
      dispatch({ type: 'setLevel', level: tierOf(campaign.mission) })
      setSelectedId(FLEET[0].id)
      setHealing(null)
      setLastAiShot(null)
      setLastPlayerShot(null)
      return
    }
    const next = cleared ? mission + 1 : mission
    setCampaign(cleared && !submitted ? { ...totals, mission: next } : { ...NEW_RUN, mission: next })
    setBanking(false)
    dispatch({ type: 'reset' })
    dispatch({ type: 'setLevel', level: tierOf(next) })
    if (cleared) dispatch({ type: 'setPlayerBoard', board: randomBoard() })
    setSelectedId(cleared ? null : FLEET[0].id)
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
  const score = computeScore({ accuracy: stats.accuracy, level: mission, won: winner === 'player', assisted, combo: combo.points })
  const cleared = winner === 'player'
  /** Missions never end: the points run ends on a loss, or when the player banks it after a win. */
  const campaignOver = !daily && (!cleared || banking)
  const totals: Run = {
    mission,
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
      submitScore({ name: trimmed, score: totals.total, accuracy: totalAccuracy, level: mission, shots: totals.shots, won: cleared, assisted: totals.assisted }),
    )
  }

  async function enterFullscreen() {
    try {
      await requestFullscreen()
    } catch {
      // Not allowed or not supported (e.g. iPhone Safari).
    }
  }

  async function goLandscape() {
    try {
      await requestFullscreen()
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')
    } catch {
      // Not supported (e.g. iOS): the overlay keeps asking the user to turn the phone.
    }
  }

  /** Chiptune while a battle runs; bosses get their own faster theme. */
  useEffect(() => {
    if (phase === 'playing' && !muted) startMusic(boss ? 'boss' : 'battle')
    else stopMusic()
  }, [phase, muted, boss])
  useEffect(() => stopMusic, [])

  useFitCell(appRef, `${phase}|${healing ? 1 : 0}`)

  const mode = aiMode(state.ai)
  const levelInfo = LEVELS[level - 1]
  const nextBoss = isBoss(mission + 1) ? ' 👹 Boss!' : ''
  const status =
    phase === 'placement'
      ? fleetPlaced(player)
        ? daily ? `Ships ready! Beat ${levelInfo.name}!` : `Ships ready! Mission ${mission}${boss ? ' 👹 Boss' : ''}: beat ${levelInfo.name}!`
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
                ? `${state.again ? '💥 Hit! Fire again!' : 'Your turn!'} ${WEAPON_ICON[weapon]} Tap the red sea to fire your ${WEAPON_INFO[weapon].name.toLowerCase()}.`
                : state.again
                  ? 'The enemy hit! It fires again…'
                  : 'Watch out! The enemy is aiming…'

  return (
    <main ref={appRef} className={`app phase-${phase} ${progress.ship} ${progress.sea}`}>
      <div className="rotate-overlay" role="alertdialog" aria-label="Rotate your phone">
        <div className="rotate-phone" aria-hidden="true" />
        <p>Turn your phone sideways to play! 🔄</p>
        {canFullscreen() && (
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
          {!fullscreen && !isInstalled() && (
            <button
              type="button"
              className="chip"
              aria-expanded={canFullscreen() ? undefined : fullscreenTip}
              onClick={canFullscreen() ? enterFullscreen : () => setFullscreenTip((t) => !t)}
            >
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
        {fullscreenTip && !canFullscreen() && (
          <p className="fullscreen-tip" role="note">
            Tap Share <span aria-hidden="true">⬆️</span>, then <b>Add to Home Screen</b>. Open the game from its icon to play full screen.
          </p>
        )}
        <p className={`status ${phase === 'over' ? `status-${winner}` : ''}`} role="status" aria-live="polite">
          {status}
        </p>
      </header>

      {phase === 'placement' && (
        <section className="controls" aria-label="Fleet placement">
          <LevelMap mission={campaign.mission} stars={progress.stars} daily={daily} />
          <div className="actions">
            <button type="button" onClick={randomize}>
              🎲 Randomize
            </button>
            <button type="button" onClick={clearBoard}>
              🧹 Clear
            </button>
            <button type="button" className="coins-btn" onClick={() => setShowRewards(true)}>
              🎒 {progress.coins} 🪙
            </button>
            <button type="button" className={`daily-btn ${daily ? 'on' : ''}`} aria-pressed={daily} onClick={toggleDaily}>
              📅 Daily {liveStreak(progress.daily, today) ? `🔥${liveStreak(progress.daily, today)}` : ''}
              {progress.daily.last === today && ' ✓'}
            </button>
          </div>
          {daily ? (
            <p className="level-hint">
              Daily challenge: today's enemy fleet is hidden in the same spots for everyone. Beat the level {DAILY_LEVEL}{' '}
              {LEVELS[DAILY_LEVEL - 1].name} to grow your streak{progress.daily.last === today ? ' (already won today)' : ' and win 🪙 50'}.
            </p>
          ) : (
          <p className="level-hint">
            Mission {mission}
            {boss && ' 👹 BOSS: every enemy ship has an extra 🛡 armoured block, and a win pays double coins'}. {levelInfo.strategy}
            {mission > 5 && ', and the enemy ships are levelled up'}. Score ×{mission}. Missions never end: win to go on; a loss keeps your mission
            but ends your points run.
            {campaign.total > 0 && ` Points so far: ${campaign.total}.`}
          </p>
          )}
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
            {daily
              ? cleared
                ? `📅 Daily challenge won! Streak: ${liveStreak(progress.daily, today)} day${liveStreak(progress.daily, today) === 1 ? '' : 's'} 🔥`
                : "The daily fleet got away. Try again or come back tomorrow!"
              : cleared
              ? `${boss ? '👹 Boss beaten! ' : ''}Mission ${mission} cleared! Next up: mission ${mission + 1}.${nextBoss}`
              : `The enemy ${levelInfo.name} wins this time. Try mission ${mission} again!`}
          </h2>
          {reward && (
            <div className="reward-strip">
              {!daily && cleared && (
                <span className="stars-won" aria-label={`${reward.stars} of 3 stars`}>
                  {starRow(reward.stars)}
                </span>
              )}
              {reward.coins > 0 && <span className="coins-won">+{reward.coins} 🪙</span>}
              {combo.best >= 2 && <span>Best combo ×{combo.best}</span>}
              {reward.badges.map((id) => {
                const b = BADGES.find((x) => x.id === id)!
                return (
                  <span key={id} className="badge-won">
                    {b.icon} New badge: {b.name}
                  </span>
                )
              })}
            </div>
          )}
          {cleared &&
            (chest ? (
              <p className="chest-prize">
                🎁 {chest.kind === 'coins' ? `You found ${chest.amount} coins!` : `+1 ${WEAPON_INFO[chest.weapon].name} in your next battle!`}
              </p>
            ) : (
              <button type="button" className="chest-btn" onClick={openLuckyChest}>
                <span aria-hidden="true">🎁</span> Open the lucky chest!
              </button>
            ))}
          <p className="lb-note">
            Your fleet {pct(healthOf(player))} · Enemy fleet {pct(healthOf(enemy))}
          </p>
          <div className="result-stats">
            <div>
              <b>{score}</b>
              <span>Mission score</span>
            </div>
            <div>
              <b>{totals.total}</b>
              <span>Points run</span>
            </div>
            <div>
              <b>{pct(stats.accuracy)}</b>
              <span>
                Accuracy ({stats.hits}/{stats.shots})
              </span>
            </div>
            <div>
              <b>{mission}</b>
              <span>Mission{boss ? ' 👹' : ''}</span>
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
          ) : !daily && cleared && !submitted ? (
            <button type="button" className="bank-btn" onClick={() => setBanking(true)}>
              🏁 Save my {totals.total} points to the leaderboard
            </button>
          ) : null}
          <LeaderboardTable highlight={submitted} />
          <button type="button" className="primary" onClick={playAgain}>
            {daily ? 'Back to the missions' : cleared ? `Next: mission ${mission + 1}${nextBoss}` : `Try mission ${mission} again`}
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
      </section>

      {phase !== 'over' && <SeaLayer />}
      {showBoard && <LeaderboardDialog onClose={() => setShowBoard(false)} />}
      {showRewards && (
        <RewardsDialog progress={progress} today={today} onBuy={(id) => setProgress((p) => buySkin(p, id))} onClose={() => setShowRewards(false)} />
      )}
      {comboPop && (
        <div key={comboPop.key} className="combo-pop" aria-live="polite">
          ×{comboPop.n} COMBO!
        </div>
      )}
    </main>
  )
}
