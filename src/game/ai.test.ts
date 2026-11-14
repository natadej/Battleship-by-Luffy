import { describe, expect, it } from 'vitest'
import { type AIState, aiMode, chooseShot, createAI, huntCandidates, recordShot, targetCandidates } from './ai'
import { type Board, type Coord, FLEET, allSunk, emptyBoard, fire, placeShip, randomBoard } from './board'
import { seeded } from './testUtils'

const sortCoords = (cs: Coord[]) => [...cs].sort((a, b) => a.r - b.r || a.c - b.c)

function shoot(ai: AIState, board: Board, coord: Coord) {
  const res = fire(board, coord)
  return { ai: recordShot(ai, coord, res), board: res.board, outcome: res.outcome }
}

/** Plays a full game with the given AI strategy and returns how many shots it took. */
function playOut(board: Board, choose: (ai: AIState) => Coord) {
  let ai = createAI()
  let shots = 0
  const seen = new Set<string>()
  while (!allSunk(board)) {
    const coord = choose(ai)
    const key = `${coord.r},${coord.c}`
    if (seen.has(key)) throw new Error(`AI repeated a shot at ${key}`)
    seen.add(key)
    ;({ ai, board } = shoot(ai, board, coord))
    shots++
  }
  return shots
}

describe('hunt mode', () => {
  it('starts in hunt mode and only fires at checkerboard cells', () => {
    const ai = createAI()
    expect(aiMode(ai)).toBe('hunt')
    const cands = huntCandidates(ai)
    expect(cands).toHaveLength(50)
    expect(cands.every(({ r, c }) => (r + c) % 2 === 0)).toBe(true)
  })

  it('stays in hunt mode after a miss', () => {
    const { ai } = shoot(createAI(), emptyBoard(), { r: 0, c: 0 })
    expect(aiMode(ai)).toBe('hunt')
    expect(targetCandidates(ai)).toEqual([])
  })
})

describe('target mode', () => {
  const cruiser = FLEET.find((s) => s.id === 'cruiser')!
  const board = placeShip(emptyBoard(), cruiser, { r: 4, c: 4 }, 'H')! // E5–E7

  it('after a single hit, targets the four adjacent cells', () => {
    const { ai } = shoot(createAI(), board, { r: 4, c: 5 })
    expect(aiMode(ai)).toBe('target')
    expect(sortCoords(targetCandidates(ai))).toEqual(
      sortCoords([{ r: 3, c: 5 }, { r: 5, c: 5 }, { r: 4, c: 4 }, { r: 4, c: 6 }]),
    )
  })

  it('skips neighbours that are off-board or already shot', () => {
    const corner = placeShip(emptyBoard(), cruiser, { r: 0, c: 0 }, 'H')!
    let s = shoot(createAI(), corner, { r: 1, c: 0 }) // miss below
    s = shoot(s.ai, s.board, { r: 0, c: 0 }) // hit in corner
    expect(targetCandidates(s.ai)).toEqual([{ r: 0, c: 1 }])
  })

  it('once two hits line up, only extends along that line', () => {
    let s = shoot(createAI(), board, { r: 4, c: 5 })
    s = shoot(s.ai, s.board, { r: 4, c: 6 })
    expect(sortCoords(targetCandidates(s.ai))).toEqual(sortCoords([{ r: 4, c: 4 }, { r: 4, c: 7 }]))
  })

  it('returns to hunt mode once the ship is sunk', () => {
    let s = shoot(createAI(), board, { r: 4, c: 5 })
    s = shoot(s.ai, s.board, { r: 4, c: 6 })
    s = shoot(s.ai, s.board, { r: 4, c: 4 })
    expect(s.outcome).toBe('sunk')
    expect(aiMode(s.ai)).toBe('hunt')
  })

  it('keeps targeting a second ship it hit while sinking the first', () => {
    const destroyer = FLEET.find((s) => s.id === 'destroyer')!
    const two = placeShip(placeShip(emptyBoard(), destroyer, { r: 0, c: 0 }, 'H')!, cruiser, { r: 1, c: 0 }, 'H')!
    let s = shoot(createAI(), two, { r: 0, c: 0 }) // destroyer hit
    s = shoot(s.ai, s.board, { r: 1, c: 0 }) // cruiser hit (vertical "line" is a false lead)
    s = shoot(s.ai, s.board, { r: 0, c: 1 }) // destroyer sunk
    expect(s.outcome).toBe('sunk')
    expect(aiMode(s.ai)).toBe('target')
    expect(sortCoords(targetCandidates(s.ai))).toEqual(sortCoords([{ r: 2, c: 0 }, { r: 1, c: 1 }]))
  })
})

describe('full games', () => {
  it('always finishes without repeating a shot', () => {
    const rng = seeded(42)
    for (let i = 0; i < 300; i++) {
      const shots = playOut(randomBoard(rng), (ai) => chooseShot(ai, rng))
      expect(shots).toBeLessThanOrEqual(100)
    }
  })

  it('is much stronger than random guessing', () => {
    const rng = seeded(7)
    const games = 300
    let smart = 0
    let random = 0
    for (let i = 0; i < games; i++) {
      const board = randomBoard(rng)
      smart += playOut(board, (ai) => chooseShot(ai, rng))
      random += playOut(board, (ai) => {
        const open = ai.grid.flatMap((row, r) => row.flatMap((k, c) => (k === 'unknown' ? [{ r, c }] : [])))
        return open[Math.floor(rng() * open.length)]
      })
    }
    const smartAvg = smart / games
    const randomAvg = random / games
    console.log(`avg shots to win — hunt/target: ${smartAvg.toFixed(1)}, random: ${randomAvg.toFixed(1)}`)
    expect(smartAvg).toBeLessThan(70)
    expect(randomAvg).toBeGreaterThan(90)
  })
})
