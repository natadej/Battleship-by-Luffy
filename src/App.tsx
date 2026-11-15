import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { type Battery, SHOT_MS, fireRocket } from './artillery'
import { Cannon } from './components/Cannon'
import { FleetStatus } from './components/FleetStatus'
import { Grid } from './components/Grid'
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
  shipAt,
  shipCells,
} from './game/board'
import { fleetPlaced, initialState, reducer } from './game/game'
import { knowledgeOf, normalize, probabilityGrid } from './game/probability'
import { computeScore, pct, statsOf } from './game/score'
import { type ScoreEntry, saveName, savedName, submitScore } from './leaderboard'
import { isMuted, playExplosion, playSplash, setMuted, unlockAudio } from './sound'
import './App.css'

/** Pause between the player's impact and the enemy starting to aim. */
const AI_PAUSE_MS = 500
const LEVEL_KEY = 'battleship-level'

type Drag = { id: string; grab: number; orientation: Orientation; source: 'picker' | 'ship'; x0: number; y0: number; moved: boolean }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function playShotSound(board: Board, coord: Coord) {
  const { outcome } = fire(board, coord)
  if (outcome === 'miss') playSplash()
  else playExplosion(outcome === 'sunk')
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

function initialLevel(): Level {
  const n = Number(localStorage.getItem(LEVEL_KEY))
  return n >= 1 && n <= 5 ? (n as Level) : 3
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ ...initialState(), level: initialLevel() }))
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

  const { phase, player, enemy, turn, winner, log, level } = state
  const selected = FLEET.find((s) => s.id === selectedId) ?? null
  const nextUnplaced = (board: Board) => FLEET.find((s) => !board.ships.some((p) => p.id === s.id))?.id ?? null

  const playerRef = useRef(player)
  useEffect(() => {
    playerRef.current = player
  }, [player])
  const dragRef = useRef<Drag | null>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const batteries = useRef<{ player: Battery | null; enemy: Battery | null }>({ player: null, enemy: null })
  const registerPlayer = useCallback((b: Battery | null) => void (batteries.current.player = b), [])
  const registerEnemy = useCallback((b: Battery | null) => void (batteries.current.enemy = b), [])

  /** Animates the attacker's cannon and rocket; resolves on impact. */
  const launch = useCallback(async (side: 'player' | 'ai', coord: Coord) => {
    const battery = batteries.current[side === 'player' ? 'player' : 'enemy']
    const board = side === 'player' ? 'enemy' : 'own'
    const target = document.querySelector<HTMLElement>(`[data-board="${board}"] [data-cell="${coord.r}-${coord.c}"]`)
    if (!battery || !target || !layerRef.current) return sleep(SHOT_MS)
    return fireRocket(battery, target, layerRef.current)
  }, [])

  // Enemy turn: a short pause, then aim and fire with the strategy for the chosen level.
  useEffect(() => {
    if (phase !== 'playing' || turn !== 'ai') return
    let cancelled = false
    const t = setTimeout(async () => {
      const coord = chooseShot(state.ai, Math.random, level)
      setInFlight('ai')
      await launch('ai', coord)
      if (cancelled) return
      playShotSound(state.player, coord)
      setLastAiShot(coord)
      dispatch({ type: 'aiFire', coord })
      setInFlight(null)
    }, AI_PAUSE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
      setInFlight(null)
    }
  }, [phase, turn, state.ai, state.player, level, launch])

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

  const preview =
    phase === 'placement' && selected && hover
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

  function chooseLevel(l: Level) {
    dispatch({ type: 'setLevel', level: l })
    localStorage.setItem(LEVEL_KEY, String(l))
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
    dispatch({ type: 'start', enemy: randomBoard(), level })
    setLastAiShot(null)
    setLastPlayerShot(null)
    setAssisted(false)
    setSubmitted(null)
  }

  async function fireAt(coord: Coord) {
    if (turn !== 'player' || inFlight || enemy.shots[coord.r][coord.c]) return
    unlockAudio()
    if (shade) setAssisted(true)
    setInFlight('player')
    await launch('player', coord)
    playShotSound(enemy, coord)
    setLastPlayerShot(coord)
    dispatch({ type: 'playerFire', coord })
    setInFlight(null)
  }

  function playAgain() {
    dispatch({ type: 'reset' })
    setSelectedId(FLEET[0].id)
    setLastAiShot(null)
    setLastPlayerShot(null)
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

  const stats = statsOf(enemy)
  const score = computeScore({ accuracy: stats.accuracy, level, won: winner === 'player', assisted })

  function saveScore() {
    const trimmed = name.trim().slice(0, 20)
    if (!trimmed) return
    saveName(trimmed)
    setSubmitted(submitScore({ name: trimmed, score, accuracy: stats.accuracy, level, shots: stats.shots, won: winner === 'player', assisted }))
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
        ? 'Fleet ready. Pick a level and start the battle.'
        : 'Drag ships onto your board, or pick one and tap a square. Tap a placed ship to rotate it.'
      : phase === 'over'
        ? winner === 'player'
          ? 'Victory! You sank the enemy fleet.'
          : 'Defeat. The enemy sank your fleet.'
        : inFlight === 'player'
          ? 'Rocket away…'
          : turn === 'player'
            ? 'Your turn. Fire on enemy waters.'
            : 'Incoming! The enemy is aiming…'

  return (
    <main className={`app phase-${phase}`}>
      <div className="rotate-overlay" role="alertdialog" aria-label="Rotate your phone">
        <div className="rotate-phone" aria-hidden="true" />
        <p>Turn your phone sideways to play.</p>
        {'requestFullscreen' in document.documentElement && (
          <button type="button" onClick={goLandscape}>
            Play in landscape
          </button>
        )}
      </div>
      <div ref={layerRef} className="rocket-layer" aria-hidden="true" />

      <header>
        <h1>Battleship</h1>
        <div className="header-actions">
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
          <div className="ship-picker">
            {FLEET.map((s) => {
              const placed = player.ships.some((p) => p.id === s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`ship-btn ${selectedId === s.id ? 'selected' : ''} ${placed ? 'placed' : ''}`}
                  aria-pressed={selectedId === s.id}
                  onClick={() => setSelectedId(s.id)}
                  onPointerDown={(e) => beginDrag(e, { id: s.id, grab: Math.floor(s.length / 2), orientation, source: 'picker' })}
                >
                  {s.name} <small>({s.length})</small>
                  {placed && ' ✓'}
                </button>
              )
            })}
          </div>
          <div className="actions">
            <button type="button" className="rotate-btn" onClick={() => setOrientation((o) => (o === 'H' ? 'V' : 'H'))}>
              ⟳ Rotate: {orientation === 'H' ? 'Horizontal' : 'Vertical'} <kbd>R</kbd>
            </button>
            <button type="button" onClick={randomize}>
              Randomize
            </button>
            <button type="button" onClick={clearBoard}>
              Clear
            </button>
          </div>
          <div className="level-picker" role="radiogroup" aria-label="Enemy level">
            <span>Enemy level</span>
            {LEVELS.map((l) => (
              <button
                key={l.level}
                type="button"
                role="radio"
                aria-checked={level === l.level}
                className={level === l.level ? 'selected' : ''}
                title={l.strategy}
                onClick={() => chooseLevel(l.level)}
              >
                {l.level} <small>{l.name}</small>
              </button>
            ))}
            <p className="level-hint">{levelInfo.strategy}. Score ×{level}.</p>
          </div>
          <button type="button" className="primary start-btn" disabled={!fleetPlaced(player)} onClick={start}>
            Start battle
          </button>
        </section>
      )}

      {phase === 'over' && (
        <section className="game-over" aria-label="Result">
          <div className="result-stats">
            <div>
              <b>{score}</b>
              <span>Score</span>
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
          {!submitted ? (
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
          ) : (
            <LeaderboardTable highlight={submitted} />
          )}
          <button type="button" className="primary" onClick={playAgain}>
            Play again
          </button>
        </section>
      )}

      <section className="boards">
        <div className="board-panel">
          <h2>
            Your fleet
            {phase !== 'placement' && (
              <span className={`ai-mode ai-${level === 1 ? 'hunt' : mode}`} title={levelInfo.strategy}>
                Lv {level} {levelInfo.name}: {level === 1 ? 'Random' : level === 5 && mode === 'hunt' ? 'Calculating' : mode === 'hunt' ? 'Hunting' : 'Targeting'}
              </span>
            )}
          </h2>
          <div className="grid-wrap">
            <Grid
              board={player}
              label="Your board"
              showShips="all"
              interactive={phase === 'placement'}
              preview={preview}
              lastShot={lastAiShot}
              onCellClick={phase === 'placement' ? handlePlacementClick : undefined}
              onCellHover={phase === 'placement' && !dragId ? setHover : undefined}
              onShipPointerDown={phase === 'placement' ? grabShip : undefined}
              draggingId={dragId}
            />
            {phase !== 'placement' && <Cannon side="player" register={registerPlayer} />}
          </div>
          {phase !== 'placement' && <FleetStatus board={player} title="Your ships" />}
        </div>

        {phase !== 'placement' && (
          <div className="board-panel">
            <h2>
              Enemy waters
              {phase === 'playing' && (
                <button
                  type="button"
                  className={`shade-toggle ${shade ? 'on' : ''}`}
                  aria-pressed={shade}
                  title="Orange glow where enemy ships are most likely, from the shots so far. Halves your score."
                  onClick={() => setShade((s) => !s)}
                >
                  Probability shade {shade ? 'on' : 'off'}
                </button>
              )}
            </h2>
            <div className="grid-wrap">
              <Grid
                board={enemy}
                label="Enemy board"
                showShips={phase === 'over' ? 'all' : 'sunk'}
                variant="enemy"
                interactive={phase === 'playing' && turn === 'player' && !inFlight}
                lastShot={lastPlayerShot}
                onCellClick={fireAt}
                heat={heat}
              />
              <Cannon side="enemy" register={registerEnemy} />
            </div>
            <FleetStatus board={enemy} title="Enemy ships" />
          </div>
        )}
      </section>

      {log.length > 0 && (
        <section className="log" aria-label="Battle log">
          <h2>Battle log</h2>
          <ol>
            {log.map((line, i) => (
              <li key={`${log.length}-${i}`}>{line}</li>
            ))}
          </ol>
        </section>
      )}

      {showBoard && <LeaderboardDialog onClose={() => setShowBoard(false)} />}
    </main>
  )
}
