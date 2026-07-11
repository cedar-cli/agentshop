import { useMemo } from 'react'
import { CREDIT_DIMS, type CreditVector } from '../../core/types'
import './radar.css'

interface Props {
  vector: CreditVector
  /** 叠加对比向量（如偏好加权目标 / 竞品） */
  compare?: CreditVector
  size?: number
  /** 各维度是否高亮（偏好权重） */
  weights?: Record<string, number>
}

const polar = (cx: number, cy: number, r: number, idx: number, total: number) => {
  const a = (Math.PI * 2 * idx) / total - Math.PI / 2
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

export function RadarChart({ vector, compare, size = 220, weights }: Props) {
  const cx = size / 2
  const cy = size / 2
  const R = size / 2 - 30
  const n = CREDIT_DIMS.length

  const rings = [0.25, 0.5, 0.75, 1]

  const path = useMemo(() => shape(vector, cx, cy, R, n), [vector, cx, cy, R, n])
  const cmpPath = useMemo(
    () => (compare ? shape(compare, cx, cy, R, n) : ''),
    [compare, cx, cy, R, n],
  )

  return (
    <svg width={size} height={size} className="radar" role="img" aria-label="履约信用雷达图">
      {rings.map((rr) => (
        <polygon
          key={rr}
          points={ringPoints(cx, cy, R * rr, n)}
          className="radar-ring"
        />
      ))}
      {CREDIT_DIMS.map((_, i) => {
        const p = polar(cx, cy, R, i, n)
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} className="radar-axis" />
      })}

      {cmpPath && <polygon points={cmpPath} className="radar-compare" />}
      <polygon points={path} className="radar-shape" />

      {CREDIT_DIMS.map((d, i) => {
        const p = polar(cx, cy, R + 16, i, n)
        const w = weights?.[d.key]
        return (
          <text
            key={d.key}
            x={p.x}
            y={p.y}
            className={`radar-label ${w && w > 30 ? 'hot' : ''}`}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {d.short}
          </text>
        )
      })}
    </svg>
  )
}

function shape(v: CreditVector, cx: number, cy: number, R: number, n: number) {
  const vals = CREDIT_DIMS.map((d) => v[d.key])
  return vals
    .map((val, i) => {
      const p = polar(cx, cy, (R * val) / 100, i, n)
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
    })
    .join(' ')
}

function ringPoints(cx: number, cy: number, r: number, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const p = polar(cx, cy, r, i, n)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')
}
