import type { CSSProperties, PointerEvent } from 'react'
import { type Board, type Coord, type Ship, ROWS, SIZE, coordLabel, isSunk, sameCoord } from '../game/board'
import { ShipSprite } from './ShipSprite'
import { ShotFx } from './ShotFx'

interface Props {
  board: Board
  label: string
  /** Which ships to draw: all of them, or only sunk ones (hidden enemy fleet). */
  showShips: 'all' | 'sunk'
  variant?: 'own' | 'enemy'
  interactive?: boolean
  /** Square tapped early, fired as soon as it's the player's turn. */
  queued?: Coord | null
  preview?: { cells: Coord[]; valid: boolean } | null
  lastShot?: Coord | null
  onCellClick?: (coord: Coord) => void
  onCellHover?: (coord: Coord | null) => void
  /** 0..1 likelihood per cell, drawn as an orange glow under the water. */
  heat?: number[][] | null
  /** Makes visible ships draggable/tappable (placement). */
  onShipPointerDown?: (ship: Ship, e: PointerEvent<HTMLDivElement>) => void
  draggingId?: string | null
  /** Where the healing box sits. */
  crate?: Coord | null
  /** Hearts bubbling up from this square (a healing box dropping or being picked up). */
  burst?: { at: Coord; key: number } | null
  /** Squares the chosen weapon will cover around the hovered square. */
  area?: Coord[] | null
}

/** Each heart's drift sideways and rise, in px. */
const HEARTS = [
  [-30, -70],
  [-14, -95],
  [2, -60],
  [16, -100],
  [32, -75],
  [-24, -40],
  [24, -45],
]
const range = Array.from({ length: SIZE }, (_, i) => i)
const at = (row: number, col: number): CSSProperties => ({ gridRow: row, gridColumn: col })

export function Grid({
  board,
  label,
  showShips,
  variant = 'own',
  interactive,
  queued,
  preview,
  lastShot,
  onCellClick,
  onCellHover,
  heat,
  onShipPointerDown,
  draggingId,
  crate,
  burst,
  area,
}: Props) {
  const visibleShips = board.ships.filter((s) => showShips === 'all' || isSunk(board, s))
  return (
    <div
      className={`grid grid-${variant}`}
      data-board={variant}
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
          if (queued && sameCoord(queued, coord)) classes.push('queued')
          if (!shot && area?.some((p) => sameCoord(p, coord))) classes.push('aim-area')
          const canClick = interactive && !!onCellClick
          const p = !shot && heat ? heat[r][c] : 0
          return (
            <button
              key={`${r}-${c}`}
              type="button"
              style={at(r + 2, c + 2)}
              className={classes.join(' ')}
              data-cell={`${r}-${c}`}
              disabled={!canClick}
              aria-label={`${coordLabel(coord)}${shot ? ` ${shot}` : ''}`}
              onClick={() => onCellClick?.(coord)}
              onMouseEnter={() => onCellHover?.(coord)}
              onFocus={() => onCellHover?.(coord)}
            >
              {p > 0.04 && <span className="heat" style={{ '--p': p.toFixed(2) } as CSSProperties} aria-hidden="true" />}
              {shot && <span className={`mark mark-${shot}`} aria-hidden="true" />}
              {isLast && shot && <ShotFx hit={shot === 'hit'} />}
            </button>
          )
        }),
      )}

      {crate && (
        <div className="crate" style={at(crate.r + 2, crate.c + 2)} aria-label={`Healing box at ${coordLabel(crate)}`}>
          <span className="crate-icon" aria-hidden="true" />
        </div>
      )}

      {burst && (
        <div key={burst.key} className="heart-burst" style={at(burst.at.r + 2, burst.at.c + 2)} aria-hidden="true">
          {HEARTS.map(([dx, dy], i) => (
            <span key={i} style={{ '--i': i, '--dx': `${dx}px`, '--dy': `${dy}px` } as CSSProperties}>
              ♥
            </span>
          ))}
        </div>
      )}

      {visibleShips.map((ship) => {
        const [first] = ship.cells
        const vertical = ship.cells.length > 1 && ship.cells[1].r !== first.r
        const sunk = isSunk(board, ship)
        return (
          <div
            key={ship.id}
            className={`ship-sprite ship-${variant} ${sunk ? 'sunk' : ''} ${vertical ? 'vertical' : ''} ${onShipPointerDown ? 'grabbable' : ''} ${draggingId === ship.id ? 'dragging' : ''}`}
            data-ship={ship.id}
            onPointerDown={onShipPointerDown ? (e) => onShipPointerDown(ship, e) : undefined}
            style={{
              gridRow: vertical ? `${first.r + 2} / span ${ship.length}` : first.r + 2,
              gridColumn: vertical ? first.c + 2 : `${first.c + 2} / span ${ship.length}`,
              animationDelay: `${-ship.length * 0.7}s`,
            }}
          >
            <ShipSprite id={ship.id} length={ship.length} orientation={vertical ? 'V' : 'H'} sunk={sunk} />
          </div>
        )
      })}
    </div>
  )
}
