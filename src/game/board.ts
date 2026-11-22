export const SIZE = 10

export type Coord = { r: number; c: number }
export type Orientation = 'H' | 'V'
export type ShotMark = 'hit' | 'miss' | null

export interface ShipDef {
  id: string
  name: string
  length: number
}

export interface Ship extends ShipDef {
  cells: Coord[]
  /** Indexes into `cells` of armoured blocks: each takes a dent first, then a hit. */
  armour?: number[]
  dented?: number[]
}

export interface Board {
  ships: Ship[]
  shots: ShotMark[][]
}

export type FireOutcome = 'miss' | 'hit' | 'sunk' | 'dent'

export interface FireResult {
  board: Board
  outcome: FireOutcome
  ship?: Ship
}

export const FLEET: ShipDef[] = [
  { id: 'carrier', name: 'Carrier', length: 5 },
  { id: 'battleship', name: 'Battleship', length: 4 },
  { id: 'cruiser', name: 'Cruiser', length: 3 },
  { id: 'submarine', name: 'Submarine', length: 3 },
  { id: 'destroyer', name: 'Destroyer', length: 2 },
]

export const ROWS = 'ABCDEFGHIJ'

export const coordLabel = ({ r, c }: Coord) => `${ROWS[r]}${c + 1}`

export const inBounds = ({ r, c }: Coord) => r >= 0 && r < SIZE && c >= 0 && c < SIZE

export const sameCoord = (a: Coord, b: Coord) => a.r === b.r && a.c === b.c

export function createGrid<T>(fill: T): T[][] {
  return Array.from({ length: SIZE }, () => Array<T>(SIZE).fill(fill))
}

export function emptyBoard(): Board {
  return { ships: [], shots: createGrid<ShotMark>(null) }
}

export function shipCells(start: Coord, length: number, orientation: Orientation): Coord[] {
  return Array.from({ length }, (_, i) =>
    orientation === 'H' ? { r: start.r, c: start.c + i } : { r: start.r + i, c: start.c },
  )
}

export function shipAt(board: Board, coord: Coord): Ship | undefined {
  return board.ships.find((s) => s.cells.some((cell) => sameCoord(cell, coord)))
}

export function canPlace(board: Board, cells: Coord[]): boolean {
  return cells.every((cell) => inBounds(cell) && !shipAt(board, cell))
}

export function placeShip(
  board: Board,
  def: ShipDef,
  start: Coord,
  orientation: Orientation,
): Board | null {
  const others = { ...board, ships: board.ships.filter((s) => s.id !== def.id) }
  const cells = shipCells(start, def.length, orientation)
  if (!canPlace(others, cells)) return null
  return { ...others, ships: [...others.ships, { ...def, cells }] }
}

export function removeShip(board: Board, id: string): Board {
  return { ...board, ships: board.ships.filter((s) => s.id !== id) }
}

export function randomBoard(rng: () => number = Math.random, fleet: ShipDef[] = FLEET): Board {
  // Retry from scratch on the (rare) dead end so we never loop forever.
  for (;;) {
    let board = emptyBoard()
    for (const def of fleet) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const orientation: Orientation = rng() < 0.5 ? 'H' : 'V'
        const start = { r: Math.floor(rng() * SIZE), c: Math.floor(rng() * SIZE) }
        const next = placeShip(board, def, start, orientation)
        if (next) {
          board = next
          break
        }
      }
    }
    if (board.ships.length === fleet.length) return board
  }
}

export function isSunk(board: Board, ship: Ship): boolean {
  return ship.cells.every(({ r, c }) => board.shots[r][c] === 'hit')
}

export function allSunk(board: Board): boolean {
  return board.ships.length > 0 && board.ships.every((s) => isSunk(board, s))
}

export function fire(board: Board, coord: Coord): FireResult {
  if (!inBounds(coord)) throw new Error(`Out of bounds: ${coord.r},${coord.c}`)
  if (board.shots[coord.r][coord.c] !== null) {
    throw new Error(`Already fired at ${coordLabel(coord)}`)
  }
  const ship = shipAt(board, coord)
  const i = ship ? ship.cells.findIndex((p) => sameCoord(p, coord)) : -1
  if (ship?.armour?.includes(i) && !ship.dented?.includes(i)) {
    const dented = { ...ship, dented: [...(ship.dented ?? []), i] }
    return { board: { ...board, ships: board.ships.map((s) => (s.id === ship.id ? dented : s)) }, outcome: 'dent', ship: dented }
  }
  const shots = board.shots.map((row) => row.slice())
  shots[coord.r][coord.c] = ship ? 'hit' : 'miss'
  const next = { ...board, shots }
  if (!ship) return { board: next, outcome: 'miss' }
  return { board: next, outcome: isSunk(next, ship) ? 'sunk' : 'hit', ship }
}
