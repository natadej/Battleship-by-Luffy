import { type Board, FLEET, isSunk } from '../game/board'

export function FleetStatus({ board, title }: { board: Board; title: string }) {
  return (
    <ul className="fleet-status" aria-label={title}>
      {FLEET.map((def) => {
        const ship = board.ships.find((s) => s.id === def.id)
        const sunk = ship ? isSunk(board, ship) : false
        return (
          <li key={def.id} className={sunk ? 'sunk' : ''}>
            <span className="pips">
              {Array.from({ length: def.length }, (_, i) => (
                <i key={i} />
              ))}
            </span>
            {def.name}
          </li>
        )
      })}
    </ul>
  )
}
