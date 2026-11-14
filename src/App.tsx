import { useEffect, useReducer, useState } from 'react'
import { FleetStatus } from './components/FleetStatus'
import { Grid } from './components/Grid'
import { aiMode, chooseShot } from './game/ai'
import {
  type Board,
  type Coord,
  type Orientation,
  FLEET,
  canPlace,
  fire,
  randomBoard,
  removeShip,
  shipAt,
  shipCells,
} from './game/board'
import { fleetPlaced, initialState, reducer } from './game/game'
import { isMuted, playExplosion, playSplash, setMuted, unlockAudio } from './sound'
import './App.css'

const AI_DELAY_MS = 650

function playShotSound(board: Board, coord: Coord) {
  const { outcome } = fire(board, coord)
  if (outcome === 'miss') playSplash()
  else playExplosion(outcome === 'sunk')
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const [selectedId, setSelectedId] = useState<string | null>(FLEET[0].id)
  const [orientation, setOrientation] = useState<Orientation>('H')
  const [hover, setHover] = useState<Coord | null>(null)
  const [lastPlayerShot, setLastPlayerShot] = useState<Coord | null>(null)
  const [lastAiShot, setLastAiShot] = useState<Coord | null>(null)
  const [muted, setMutedState] = useState(isMuted)

  const { phase, player, enemy, turn, winner, log } = state
  const selected = FLEET.find((s) => s.id === selectedId) ?? null
  const nextUnplaced = (board = player) => FLEET.find((s) => !board.ships.some((p) => p.id === s.id))?.id ?? null

  // Enemy turn: think for a moment, then fire using Hunt & Target.
  useEffect(() => {
    if (phase !== 'playing' || turn !== 'ai') return
    const t = setTimeout(() => {
      const coord = chooseShot(state.ai)
      playShotSound(state.player, coord)
      setLastAiShot(coord)
      dispatch({ type: 'aiFire', coord })
    }, AI_DELAY_MS)
    return () => clearTimeout(t)
  }, [phase, turn, state.ai, state.player])

  // R rotates the ship being placed.
  useEffect(() => {
    if (phase !== 'placement') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setOrientation((o) => (o === 'H' ? 'V' : 'H'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

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
      // Pick an already-placed ship back up to move it.
      dispatch({ type: 'remove', id: existing.id })
      setSelectedId(existing.id)
      return
    }
    if (!selected) return
    const cells = shipCells(coord, selected.length, orientation)
    const after = removeShip(player, selected.id)
    if (!canPlace(after, cells)) return
    dispatch({ type: 'place', ship: selected, start: coord, orientation })
    const placed = { ...after, ships: [...after.ships, { ...selected, cells }] }
    setSelectedId(nextUnplaced(placed))
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
    dispatch({ type: 'start', enemy: randomBoard() })
    setLastAiShot(null)
    setLastPlayerShot(null)
  }

  function fireAt(coord: Coord) {
    if (turn !== 'player' || enemy.shots[coord.r][coord.c]) return
    unlockAudio()
    playShotSound(enemy, coord)
    setLastPlayerShot(coord)
    dispatch({ type: 'playerFire', coord })
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

  const mode = aiMode(state.ai)
  const status =
    phase === 'placement'
      ? fleetPlaced(player)
        ? 'Fleet ready. Start the battle when you are.'
        : 'Place your fleet: pick a ship, then click your board.'
      : phase === 'over'
        ? winner === 'player'
          ? 'Victory! You sank the enemy fleet.'
          : 'Defeat. The enemy sank your fleet.'
        : turn === 'player'
          ? 'Your turn. Fire on enemy waters.'
          : 'Enemy is aiming…'

  return (
    <main className="app">
      <header>
        <h1>Battleship</h1>
        <button type="button" className="sound-toggle" aria-pressed={!muted} onClick={toggleSound}>
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
                >
                  {s.name} <small>({s.length})</small>
                  {placed && ' ✓'}
                </button>
              )
            })}
          </div>
          <div className="actions">
            <button type="button" onClick={() => setOrientation((o) => (o === 'H' ? 'V' : 'H'))}>
              Rotate: {orientation === 'H' ? 'Horizontal' : 'Vertical'} <kbd>R</kbd>
            </button>
            <button type="button" onClick={randomize}>
              Randomize
            </button>
            <button type="button" onClick={clearBoard}>
              Clear
            </button>
            <button type="button" className="primary" disabled={!fleetPlaced(player)} onClick={start}>
              Start battle
            </button>
          </div>
        </section>
      )}

      {phase === 'over' && (
        <div className="controls">
          <button type="button" className="primary" onClick={playAgain}>
            Play again
          </button>
        </div>
      )}

      <section className="boards">
        <div className="board-panel">
          <h2>
            Your fleet
            {phase !== 'placement' && (
              <span className={`ai-mode ai-${mode}`} title="Strategy the enemy AI is using against your fleet">
                Enemy AI: {mode === 'hunt' ? 'Hunting' : 'Targeting'}
              </span>
            )}
          </h2>
          <Grid
            board={player}
            label="Your board"
            showShips="all"
            interactive={phase === 'placement'}
            preview={preview}
            lastShot={lastAiShot}
            onCellClick={phase === 'placement' ? handlePlacementClick : undefined}
            onCellHover={phase === 'placement' ? setHover : undefined}
          />
          {phase !== 'placement' && <FleetStatus board={player} title="Your ships" />}
        </div>

        {phase !== 'placement' && (
          <div className="board-panel">
            <h2>Enemy waters</h2>
            <Grid
              board={enemy}
              label="Enemy board"
              showShips={phase === 'over' ? 'all' : 'sunk'}
              variant="enemy"
              interactive={phase === 'playing' && turn === 'player'}
              lastShot={lastPlayerShot}
              onCellClick={fireAt}
            />
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
    </main>
  )
}
