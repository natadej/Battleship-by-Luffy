import { type AIState, createAI, recordShot } from './ai'
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

export interface GameState {
  phase: Phase
  player: Board
  enemy: Board
  ai: AIState
  turn: Side
  winner: Side | null
  log: string[]
}

export type Action =
  | { type: 'place'; ship: ShipDef; start: Coord; orientation: Orientation }
  | { type: 'remove'; id: string }
  | { type: 'setPlayerBoard'; board: Board }
  | { type: 'start'; enemy: Board }
  | { type: 'playerFire'; coord: Coord }
  | { type: 'aiFire'; coord: Coord }
  | { type: 'reset' }

export const initialState = (): GameState => ({
  phase: 'placement',
  player: emptyBoard(),
  enemy: emptyBoard(),
  ai: createAI(),
  turn: 'player',
  winner: null,
  log: [],
})

export const fleetPlaced = (board: Board) => board.ships.length === FLEET.length

const MAX_LOG = 8

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
      return { ...state, phase: 'playing', enemy: action.enemy, turn: 'player', log: ['Battle stations! Your move.'] }
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
    case 'reset':
      return initialState()
  }
}
