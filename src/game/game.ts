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
  placeShip,
  removeShip,
} from './board'

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
  /** Squares hit by air raids rather than aimed shots (kept out of accuracy). */
  raided: { player: Coord[]; enemy: Coord[] }
}

export type Action =
  | { type: 'place'; ship: ShipDef; start: Coord; orientation: Orientation }
  | { type: 'remove'; id: string }
  | { type: 'setPlayerBoard'; board: Board }
  | { type: 'start'; enemy: Board; level: Level }
  | { type: 'playerFire'; coord: Coord }
  | { type: 'aiFire'; coord: Coord }
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
})

export const fleetPlaced = (board: Board) => board.ships.length === FLEET.length

const MAX_LOG = 8

const outcomeText = (coord: Coord, outcome: string, shipName?: string) =>
  `${coordLabel(coord)} ${outcome === 'sunk' ? `sank the ${shipName}` : outcome}`

function describe(who: string, coord: Coord, outcome: string, shipName?: string) {
  const at = coordLabel(coord)
  if (outcome === 'miss') return `${who} fired at ${at}: miss.`
  if (outcome === 'hit') return `${who} fired at ${at}: hit!`
  return `${who} fired at ${at}: sank the ${shipName}!`
}

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
      return { ...state, phase: 'playing', enemy: action.enemy, level: action.level, turn: 'player', log: ['Battle stations! Your move.'] }
    case 'playerFire': {
      const { coord } = action
      if (state.phase !== 'playing' || state.turn !== 'player') return state
      if (state.enemy.shots[coord.r][coord.c] !== null) return state
      const result = fire(state.enemy, coord)
      const won = allSunk(result.board)
      return {
        ...state,
        enemy: result.board,
        turn: won ? 'player' : 'ai',
        phase: won ? 'over' : 'playing',
        winner: won ? 'player' : null,
        log: [describe('You', coord, result.outcome, result.ship?.name), ...state.log].slice(0, MAX_LOG),
      }
    }
    case 'aiFire': {
      const { coord } = action
      if (state.phase !== 'playing' || state.turn !== 'ai') return state
      if (state.player.shots[coord.r][coord.c] !== null) return state
      const result = fire(state.player, coord)
      const won = allSunk(result.board)
      return {
        ...state,
        player: result.board,
        ai: recordShot(state.ai, coord, result),
        turn: 'player',
        phase: won ? 'over' : 'playing',
        winner: won ? 'ai' : null,
        log: [describe('Enemy', coord, result.outcome, result.ship?.name), ...state.log].slice(0, MAX_LOG),
      }
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
