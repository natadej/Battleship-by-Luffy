import type { Level } from './ai'
import { type Board, FLEET } from './board'
import type { Arsenal, Special } from './weapons'

/** Missions never end: the AI's strategy tops out at Admiral (level 5), then the enemy fleet levels up instead. */
export const BOSS_EVERY = 5
export const isBoss = (mission: number) => mission % BOSS_EVERY === 0
export const tierOf = (mission: number): Level => Math.min(5, Math.max(1, mission)) as Level

/** The special each ship adds to its side's arsenal from ship level 2. */
export const SHIP_SPECIAL: Record<string, Special> = { carrier: 'b52', battleship: 'nuke', cruiser: 'mg', submarine: 'nuke', destroyer: 'mg' }

/** Ship level perks: +1 special from level 2; an armoured block at level 3 and another at level 6. */
export const perksOf = (level: number) => ({ special: level >= 2 ? 1 : 0, armour: Math.min(2, Math.floor(level / 3)) })

export type FleetLevels = Record<string, number>

/** After mission 5 the enemy gets one ship level per mission, biggest ship first, round and round. */
export function enemyFleetLevels(mission: number): FleetLevels {
  const ups = Math.max(0, mission - 5)
  return Object.fromEntries(FLEET.map((s, i) => [s.id, 1 + Math.floor(ups / FLEET.length) + (i < ups % FLEET.length ? 1 : 0)]))
}

export function fleetBonus(levels: FleetLevels): Partial<Arsenal> {
  const bonus: Partial<Arsenal> = {}
  for (const f of FLEET) if (perksOf(levels[f.id] ?? 1).special) bonus[SHIP_SPECIAL[f.id]] = (bonus[SHIP_SPECIAL[f.id]] ?? 0) + 1
  return bonus
}

/** Puts each ship's armour on random blocks (always leaving one bare); a boss adds one more per ship. */
export function armFleet(board: Board, levels: FleetLevels, extra = 0, rng: () => number = Math.random): Board {
  return {
    ...board,
    ships: board.ships.map((s) => {
      const n = Math.min(s.length - 1, perksOf(levels[s.id] ?? 1).armour + extra)
      const picks = [...s.cells.keys()].sort(() => rng() - 0.5).slice(0, n)
      return { ...s, armour: picks.sort((a, b) => a - b), dented: [] }
    }),
  }
}
