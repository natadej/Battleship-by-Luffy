import { type AIState, type Level, createAI, recordShot } from './ai'
import {
  type Board,
  type Coord,
  type Orientation,
  type ShipDef,
  FLEET,
  allSunk,
  coordLabel,
  emptyBoard,
  fire,
  isSunk,
  placeShip,
  removeShip,
  inBounds,
} from './board'
import { type Arsenal, type Special, type Weapon, fullArsenal, onCrate } from './weapons'

export type Phase = 'placement' | 'playing' | 'over'
export type Side = 'player' | 'ai'
export type Winner = Side | 'draw'

export interface GameState {
  phase: Phase
  player: Board
  enemy: Board
  ai: AIState
  level: Level
  turn: Side
  winner: Winner | null
  log: string[]
  /** Specials left this level. */
  arsenal: { player: Arsenal; ai: Arsenal }
  /** The healing box on each board (`player` = on the player's board, for the AI to collect). */
  crates: { player: Coord | null; enemy: Coord | null }
  /** Whether this level's one healing box has dropped yet. */
  dropped: boolean
  /** Full rounds played this level (one shot each). */
  round: number
  /** Who is holding an unused healing kit. */
  kits: { player: boolean; ai: boolean }
  /** Squares fired at and squares hit, per shooter (the healing kit turns hits back into water). */
  tally: { player: Tally; ai: Tally }
  /** Squares hit by air raids rather than aimed shots (kept out of accuracy). */
  raided: { player: Coord[]; enemy: Coord[] }
}

export type Tally = { shots: number; hits: number }

export type Action =
  | { type: 'place'; ship: ShipDef; start: Coord; orientation: Orientation }
  | { type: 'remove'; id: string }
  | { type: 'setPlayerBoard'; board: Board }
  | { type: 'start'; enemy: Board; level: Level; crates?: GameState['crates']; bonus?: Special | null; enemyBonus?: Partial<Arsenal> }
  | { type: 'playerFire'; coord: Coord; weapon?: Weapon; cells?: Coord[] }
  | { type: 'aiFire'; coord: Coord; weapon?: Weapon; cells?: Coord[] }
  | { type: 'heal'; side: Side; id: string; cells: Coord[] }
  | { type: 'drop'; board: 'player' | 'enemy'; at: Coord }
  | { type: 'raid'; player: Coord[]; enemy: Coord[] }
  | { type: 'setLevel'; level: Level }
  | { type: 'reset' }

export const initialState = (): GameState => ({
  phase: 'placement',
  player: emptyBoard(),
  enemy: emptyBoard(),
  ai: createAI(),
  level: 1,
  turn: 'player',
  winner: null,
  log: [],
  raided: { player: [], enemy: [] },
  arsenal: { player: fullArsenal(), ai: fullArsenal() },
  crates: { player: null, enemy: null },
  dropped: false,
  round: 0,
  kits: { player: false, ai: false },
  tally: { player: { shots: 0, hits: 0 }, ai: { shots: 0, hits: 0 } },
})

export const fleetPlaced = (board: Board) => board.ships.length === FLEET.length

const MAX_LOG = 8

const outcomeText = (coord: Coord, outcome: string, shipName?: string) =>
  `${coordLabel(coord)} ${outcome === 'sunk' ? `sank the ${shipName}` : outcome === 'dent' ? 'dented armour' : outcome}`

function describe(who: string, coord: Coord, outcome: string, shipName?: string) {
  const at = coordLabel(coord)
  if (outcome === 'miss') return `${who} fired at ${at}: miss.`
  if (outcome === 'hit') return `${who} fired at ${at}: hit!`
  if (outcome === 'dent') return `${who} fired at ${at}: dented the armour!`
  return `${who} fired at ${at}: sank the ${shipName}!`
}

/** Fires one weapon: the target and any extra squares. Returns null if the shot isn't allowed. */
function volley(state: GameState, side: Side, coord: Coord, weapon: Weapon, cells: Coord[]) {
  const board = side === 'player' ? state.enemy : state.player
  if (!inBounds(coord) || board.shots[coord.r][coord.c] !== null) return null
  const arsenal = state.arsenal[side]
  if (weapon !== 'missile' && arsenal[weapon] <= 0) return null
  let next = board
  let ai = state.ai
  let hits = 0
  let worst: { outcome: string; ship?: string } = { outcome: 'miss' }
  const fired: Coord[] = []
  for (const p of [coord, ...cells.filter((q) => !(q.r === coord.r && q.c === coord.c))]) {
    if (!inBounds(p) || next.shots[p.r][p.c] !== null) continue
    const result = fire(next, p)
    next = result.board
    fired.push(p)
    if (side === 'ai') ai = recordShot(ai, p, result)
    if (result.outcome !== 'miss') hits++
    if (result.outcome === 'sunk' || (result.outcome !== 'miss' && worst.outcome === 'miss')) worst = { outcome: result.outcome, ship: result.ship?.name }
  }
  const crateKey = side === 'player' ? 'enemy' : 'player'
  const collected = onCrate(fired, state.crates[crateKey])
  const t = state.tally[side]
  return {
    board: next,
    ai,
    worst,
    arsenal: { ...state.arsenal, [side]: weapon === 'missile' ? arsenal : { ...arsenal, [weapon]: arsenal[weapon] - 1 } },
    crates: collected ? { ...state.crates, [crateKey]: null } : state.crates,
    kits: collected ? { ...state.kits, [side]: true } : state.kits,
    tally: { ...state.tally, [side]: { shots: t.shots + fired.length, hits: t.hits + hits } },
  }
}

const addArsenal = (a: Arsenal, extra: Partial<Arsenal> = {}): Arsenal => ({
  nuke: a.nuke + (extra.nuke ?? 0),
  mg: a.mg + (extra.mg ?? 0),
  b52: a.b52 + (extra.b52 ?? 0),
})

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'place': {
      if (state.phase !== 'placement') return state
      const board = placeShip(state.player, action.ship, action.start, action.orientation)
      return board ? { ...state, player: board } : state
    }
    case 'remove':
      if (state.phase !== 'placement') return state
      return { ...state, player: removeShip(state.player, action.id) }
    case 'setPlayerBoard':
      if (state.phase !== 'placement') return state
      return { ...state, player: action.board }
    case 'start':
      if (state.phase !== 'placement' || !fleetPlaced(state.player)) return state
      return {
        ...state,
        phase: 'playing',
        enemy: action.enemy,
        level: action.level,
        turn: 'player',
        log: ['Battle stations! Your move.'],
        crates: action.crates ?? { player: null, enemy: null },
        dropped: !!action.crates,
        round: 0,
        arsenal: {
          player: action.bonus ? { ...state.arsenal.player, [action.bonus]: state.arsenal.player[action.bonus] + 1 } : state.arsenal.player,
          ai: addArsenal(state.arsenal.ai, action.enemyBonus),
        },
      }
    case 'playerFire': {
      const { coord } = action
      if (state.phase !== 'playing' || state.turn !== 'player') return state
      const v = volley(state, 'player', coord, action.weapon ?? 'missile', action.cells ?? [coord])
      if (!v) return state
      const won = allSunk(v.board)
      return {
        ...state,
        enemy: v.board,
        arsenal: v.arsenal,
        crates: v.crates,
        kits: v.kits,
        tally: v.tally,
        turn: won ? 'player' : 'ai',
        phase: won ? 'over' : 'playing',
        winner: won ? 'player' : null,
        log: [describe('You', coord, v.worst.outcome, v.worst.ship), ...state.log].slice(0, MAX_LOG),
      }
    }
    case 'aiFire': {
      const { coord } = action
      if (state.phase !== 'playing' || state.turn !== 'ai') return state
      const v = volley(state, 'ai', coord, action.weapon ?? 'missile', action.cells ?? [coord])
      if (!v) return state
      const won = allSunk(v.board)
      return {
        ...state,
        player: v.board,
        ai: v.ai,
        arsenal: v.arsenal,
        crates: v.crates,
        kits: v.kits,
        tally: v.tally,
        round: state.round + 1,
        turn: 'player',
        phase: won ? 'over' : 'playing',
        winner: won ? 'ai' : null,
        log: [describe('Enemy', coord, v.worst.outcome, v.worst.ship), ...state.log].slice(0, MAX_LOG),
      }
    }
    case 'drop': {
      const { board, at } = action
      if (state.phase !== 'playing' || state.dropped || !inBounds(at) || state[board].shots[at.r][at.c] !== null) return state
      return { ...state, dropped: true, crates: { ...state.crates, [board]: at } }
    }
    case 'heal': {
      const { side, id, cells } = action
      if (state.phase !== 'playing' || state.turn !== side || !state.kits[side]) return state
      const key = side === 'player' ? 'player' : 'enemy'
      const board = state[key]
      const ship = board.ships.find((s) => s.id === id)
      if (!ship || cells.length !== ship.length || isSunk(board, ship)) return state
      const hurt = ship.cells.filter((p) => board.shots[p.r][p.c] === 'hit')
      if (!hurt.length) return state
      const clear = cells.every((p) => inBounds(p) && board.shots[p.r][p.c] === null && board.ships.every((s) => s.id === id || !s.cells.some((q) => q.r === p.r && q.c === p.c)))
      if (!clear) return state
      // The old hits become plain water: the ship has moved away from them.
      const shots = board.shots.map((row) => row.slice())
      for (const p of hurt) shots[p.r][p.c] = 'miss'
      const healed: Board = { shots, ships: board.ships.map((s) => (s.id === id ? { ...s, cells, dented: [] } : s)) }
      let ai = state.ai
      if (side === 'player') {
        const grid = ai.grid.map((row) => row.slice())
        for (const p of hurt) grid[p.r][p.c] = 'miss'
        ai = { ...ai, grid }
      }
      // The tally is untouched: hits that were healed away still count for the shooter's accuracy.
      return { ...state, [key]: healed, ai, kits: { ...state.kits, [side]: false } }
    }
    case 'raid': {
      if (state.phase !== 'playing') return state
      let { enemy, player, ai } = state
      const raided = { player: [...state.raided.player], enemy: [...state.raided.enemy] }
      const report = { enemy: [] as string[], player: [] as string[] }
      for (const coord of action.enemy) {
        if (enemy.shots[coord.r][coord.c] !== null) continue
        const result = fire(enemy, coord)
        enemy = result.board
        raided.enemy.push(coord)
        report.enemy.push(outcomeText(coord, result.outcome, result.ship?.name))
      }
      for (const coord of action.player) {
        if (player.shots[coord.r][coord.c] !== null) continue
        const result = fire(player, coord)
        player = result.board
        ai = recordShot(ai, coord, result)
        raided.player.push(coord)
        report.player.push(outcomeText(coord, result.outcome, result.ship?.name))
      }
      if (!report.enemy.length && !report.player.length) return state
      const enemyDown = allSunk(enemy)
      const playerDown = allSunk(player)
      const winner: Winner | null = enemyDown && playerDown ? 'draw' : enemyDown ? 'player' : playerDown ? 'ai' : null
      const line = `Air raid! Enemy waters: ${report.enemy.join(', ') || 'none'}. Your fleet: ${report.player.join(', ') || 'none'}.`
      return {
        ...state,
        enemy,
        player,
        ai,
        raided,
        phase: winner ? 'over' : 'playing',
        winner,
        log: [line, ...state.log].slice(0, MAX_LOG),
      }
    }
    case 'setLevel':
      return state.phase === 'placement' ? { ...state, level: action.level } : state
    case 'reset':
      return { ...initialState(), level: state.level }
  }
}
