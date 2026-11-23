import { FLEET } from './board'
import type { FleetLevels } from './fleet'

/** One of the player's own ships: its level, the blocks upgraded towards the next level, and the name the player gave it. */
export interface ShipRecord {
  level: number
  blocks: number[]
  name?: string
}

export type Garage = Partial<Record<string, ShipRecord>>

const NEW_SHIP: ShipRecord = { level: 1, blocks: [] }
export const shipRecord = (garage: Garage, id: string): ShipRecord => garage[id] ?? NEW_SHIP
export const shipName = (garage: Garage, id: string) => shipRecord(garage, id).name || FLEET.find((s) => s.id === id)!.name

/** A block costs as many parts as the ship's level, so each level takes a little longer than the last. */
export const blockCost = (level: number) => level

/** 🔩 parts for a battle: 1 for trying, more for stars and later missions, double for a boss. */
export const partsFor = (won: boolean, stars: number, mission: number, boss = false) =>
  won ? (1 + stars + Math.floor(mission / 5)) * (boss ? 2 : 1) : 1

export type Upgrade = { garage: Garage; parts: number; levelled: boolean }

/** Upgrades one block; when every block of the ship is upgraded, the ship goes up a level and starts again. */
export function upgradeBlock(garage: Garage, parts: number, id: string, block: number, wrecks: string[] = []): Upgrade | null {
  const def = FLEET.find((s) => s.id === id)
  const rec = shipRecord(garage, id)
  const cost = blockCost(rec.level)
  if (!def || wrecks.includes(id) || block < 0 || block >= def.length || rec.blocks.includes(block) || parts < cost) return null
  const blocks = [...rec.blocks, block].sort((a, b) => a - b)
  const levelled = blocks.length === def.length
  const next: ShipRecord = levelled ? { ...rec, level: rec.level + 1, blocks: [] } : { ...rec, blocks }
  return { garage: { ...garage, [id]: next }, parts: parts - cost, levelled }
}

export function renameShip(garage: Garage, id: string, name: string): Garage {
  return { ...garage, [id]: { ...shipRecord(garage, id), name: name.trim().slice(0, 14) || undefined } }
}

export const playerFleetLevels = (garage: Garage): FleetLevels => Object.fromEntries(FLEET.map((s) => [s.id, shipRecord(garage, s.id).level]))

/** 🪙 to repair a ship sunk last battle: 2 a block. An unrepaired wreck still sails, but at Lv 1 with no perks. */
export const repairCost = (length: number) => length * 2

/** Ship levels for the next battle: wrecks fight at Lv 1 until repaired. */
export const battleLevels = (garage: Garage, wrecks: string[]): FleetLevels =>
  Object.fromEntries(FLEET.map((s) => [s.id, wrecks.includes(s.id) ? 1 : shipRecord(garage, s.id).level]))
