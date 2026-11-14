import type { Orientation } from '../game/board'

interface Props {
  id: string
  length: number
  orientation: Orientation
}

const U = 100 // one cell in SVG units

function hullPath(w: number, top: number, bottom: number) {
  const mid = (top + bottom) / 2
  return `M 12 ${mid} C 12 ${top + 6}, 24 ${top}, 46 ${top} L ${w - 90} ${top} C ${w - 40} ${top}, ${w - 14} ${mid - 14}, ${w - 6} ${mid} C ${w - 14} ${mid + 14}, ${w - 40} ${bottom}, ${w - 90} ${bottom} L 46 ${bottom} C 24 ${bottom}, 12 ${bottom - 6}, 12 ${mid} Z`
}

function Turret({ x }: { x: number }) {
  return (
    <g>
      <rect x={x} y={46} width={34} height={8} rx={3} className="ship-detail" />
      <circle cx={x} cy={50} r={13} className="ship-turret" />
    </g>
  )
}

function Details({ id, length }: { id: string; length: number }) {
  const w = length * U
  switch (id) {
    case 'carrier':
      return (
        <g>
          <line x1={40} y1={50} x2={w - 70} y2={50} className="ship-runway" />
          <rect x={w - 200} y={20} width={70} height={18} rx={4} className="ship-detail" />
          <rect x={60} y={28} width={60} height={12} rx={3} className="ship-turret" />
          <rect x={160} y={60} width={60} height={12} rx={3} className="ship-turret" />
        </g>
      )
    case 'submarine':
      return (
        <g>
          <ellipse cx={w / 2 - 10} cy={50} rx={34} ry={10} className="ship-turret" />
          <line x1={w / 2 - 10} y1={50} x2={w / 2 + 30} y2={50} className="ship-runway" />
        </g>
      )
    default: {
      const bridgeX = w / 2 - 35
      const turrets = id === 'destroyer' ? [w - 120] : id === 'cruiser' ? [70, w - 120] : [70, 160, w - 120]
      return (
        <g>
          {turrets.map((x) => (
            <Turret key={x} x={x} />
          ))}
          <rect x={bridgeX} y={34} width={60} height={32} rx={6} className="ship-detail" />
          <rect x={bridgeX + 14} y={42} width={22} height={16} rx={3} className="ship-turret" />
        </g>
      )
    }
  }
}

/** A top-down ship drawn horizontally (bow to the right) and mirrored onto the diagonal when vertical. */
export function ShipSprite({ id, length, orientation }: Props) {
  const w = length * U
  const [top, bottom] = id === 'submarine' ? [30, 70] : id === 'carrier' ? [14, 86] : [20, 80]
  const vertical = orientation === 'V'
  return (
    <svg
      viewBox={vertical ? `0 0 ${U} ${w}` : `0 0 ${w} ${U}`}
      aria-hidden="true"
      focusable="false"
    >
      <g transform={vertical ? 'matrix(0 1 1 0 0 0)' : undefined}>
        <path d={hullPath(w, top + 4, bottom + 4)} className="ship-shadow" />
        <path d={hullPath(w, top, bottom)} className="ship-hull" />
        <path d={hullPath(w, top + 8, bottom - 8)} className="ship-deck" />
        <Details id={id} length={length} />
      </g>
    </svg>
  )
}
