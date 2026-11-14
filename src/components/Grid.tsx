import type { CSSProperties } from 'react'
import { type Board, type Coord, ROWS, SIZE, coordLabel, isSunk, sameCoord } from '../game/board'
import { ShipSprite } from './ShipSprite'
import { ShotFx } from './ShotFx'

interface Props {
  board: Board
  label: string
  /** Which ships to draw: all of them, or only sunk ones (hidden enemy fleet). */
  showShips: 'all' | 'sunk'
  variant?: 'own' | 'enemy'
  interactive?: boolean
  preview?: { cells: Coord[]; valid: boolean } | null
  lastShot?: Coord | null
  onCellClick?: (coord: Coord) => void
  onCellHover?: (coord: Coord | null) => void
}

const range = Array.from({ length: SIZE }, (_, i) => i)
const at = (row: number, col: number): CSSProperties => ({ gridRow: row, gridColumn: col })

export function Grid({
  board,
  label,
  showShips,
  variant = 'own',
  interactive,
  preview,
  lastShot,
  onCellClick,
  onCellHover,
}: Props) {
  const visibleShips = board.ships.filter((s) => showShips === 'all' || isSunk(board, s))
  return (
    <div
      className={`grid grid-${variant}`}
      role="grid"
      aria-label={label}
      onMouseLeave={() => onCellHover?.(null)}
    >
      <div className="grid-corner" style={at(1, 1)} />
      {range.map((c) => (
        <div key={`col-${c}`} className="grid-head grid-col-head" style={at(1, c + 2)}>
          {c + 1}
        </div>
      ))}
      {range.map((r) => (
        <div key={`row-${r}`} className="grid-head" style={at(r + 2, 1)}>
          {ROWS[r]}
        </div>
      ))}

      {range.flatMap((r) =>
        range.map((c) => {
          const coord = { r, c }
          const shot = board.shots[r][c]
          const inPreview = preview?.cells.some((p) => sameCoord(p, coord))
          const isLast = !!lastShot && sameCoord(lastShot, coord)
          const classes = ['cell']
          if (shot) classes.push(shot)
          if (inPreview) classes.push(preview!.valid ? 'preview-ok' : 'preview-bad')
          if (isLast) classes.push('last')
          const canClick = interactive && !!onCellClick
          return (
            <button
              key={`${r}-${c}`}
              type="button"
              style={at(r + 2, c + 2)}
              className={classes.join(' ')}
              disabled={!canClick}
              aria-label={`${coordLabel(coord)}${shot ? ` ${shot}` : ''}`}
              onClick={() => onCellClick?.(coord)}
              onMouseEnter={() => onCellHover?.(coord)}
              onFocus={() => onCellHover?.(coord)}
            >
              {shot && <span className={`mark mark-${shot}`} aria-hidden="true" />}
              {isLast && shot && <ShotFx hit={shot === 'hit'} />}
            </button>
          )
        }),
      )}

      {visibleShips.map((ship) => {
        const [first] = ship.cells
        const vertical = ship.cells.length > 1 && ship.cells[1].r !== first.r
        const sunk = isSunk(board, ship)
        return (
          <div
            key={ship.id}
            className={`ship-sprite ${sunk ? 'sunk' : ''} ${vertical ? 'vertical' : ''}`}
            data-ship={ship.id}
            style={{
              gridRow: vertical ? `${first.r + 2} / span ${ship.length}` : first.r + 2,
              gridColumn: vertical ? first.c + 2 : `${first.c + 2} / span ${ship.length}`,
              animationDelay: `${-ship.length * 0.7}s`,
            }}
          >
            <ShipSprite id={ship.id} length={ship.length} orientation={vertical ? 'V' : 'H'} />
          </div>
        )
      })}
    </div>
  )
}
