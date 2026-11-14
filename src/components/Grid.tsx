import { type Board, type Coord, ROWS, SIZE, coordLabel, isSunk, sameCoord, shipAt } from '../game/board'

interface Props {
  board: Board
  label: string
  showShips: boolean
  interactive?: boolean
  preview?: { cells: Coord[]; valid: boolean } | null
  lastShot?: Coord | null
  onCellClick?: (coord: Coord) => void
  onCellHover?: (coord: Coord | null) => void
}

const range = Array.from({ length: SIZE }, (_, i) => i)

export function Grid({ board, label, showShips, interactive, preview, lastShot, onCellClick, onCellHover }: Props) {
  return (
    <div className="grid" role="grid" aria-label={label} onMouseLeave={() => onCellHover?.(null)}>
      <div className="grid-corner" />
      {range.map((c) => (
        <div key={`col-${c}`} className="grid-head">
          {c + 1}
        </div>
      ))}
      {range.map((r) => [
        <div key={`row-${r}`} className="grid-head">
          {ROWS[r]}
        </div>,
        ...range.map((c) => {
          const coord = { r, c }
          const shot = board.shots[r][c]
          const ship = shipAt(board, coord)
          const sunk = ship && isSunk(board, ship)
          const inPreview = preview?.cells.some((p) => sameCoord(p, coord))
          const classes = ['cell']
          if (ship && (showShips || sunk)) classes.push('ship')
          if (shot) classes.push(shot)
          if (sunk) classes.push('sunk')
          if (inPreview) classes.push(preview!.valid ? 'preview-ok' : 'preview-bad')
          if (lastShot && sameCoord(lastShot, coord)) classes.push('last')
          const canClick = interactive && !!onCellClick
          return (
            <button
              key={`${r}-${c}`}
              type="button"
              className={classes.join(' ')}
              disabled={!canClick}
              aria-label={`${coordLabel(coord)}${shot ? ` ${shot}` : ''}${sunk ? ' sunk' : ''}`}
              onClick={() => onCellClick?.(coord)}
              onMouseEnter={() => onCellHover?.(coord)}
              onFocus={() => onCellHover?.(coord)}
            >
              {shot === 'hit' ? '✕' : shot === 'miss' ? '•' : ''}
            </button>
          )
        }),
      ])}
    </div>
  )
}
