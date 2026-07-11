import { useEffect, useMemo, useState } from 'react'
import {
  DEMO_NODES,
  DEMO_STEPS,
  LAYERS,
  type Arrow,
  type Chip,
  type DemoNode,
} from './demoScript'
import './stage.css'

const VW = 1000
const VH = 620
const LAYER_Y: Record<string, number> = {
  factory: 96,
  warehouse: 232,
  store: 368,
  consumer: 512,
}
const LEFT = 210
const SPAN = 700
const CHAIN = { x: 958, y: 46 } // RepChain 芯片汇聚点
const STEP_MS = 5200

interface Pos {
  x: number
  y: number
  node: DemoNode
}

const ARROW_COLOR: Record<Arrow['kind'], string> = {
  bid: 'var(--color-proposal)',
  procure: 'var(--color-supply)',
  fulfil: 'var(--color-data)',
}

export function SupplyChainStage() {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [chipsFlown, setChipsFlown] = useState(false)

  const positions = useMemo(() => computePositions(), [])
  const cur = DEMO_STEPS[step]
  const focusSet = useMemo(() => new Set(cur.focus), [cur])
  const isFocused = (id: string) => focusSet.size === 0 || focusSet.has(id)

  // 自动播放
  useEffect(() => {
    if (!playing) return
    if (step >= DEMO_STEPS.length - 1) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS)
    return () => clearTimeout(t)
  }, [playing, step])

  // 芯片飞行：进入本步后下一帧触发位移动画
  useEffect(() => {
    setChipsFlown(false)
    const r = requestAnimationFrame(() =>
      requestAnimationFrame(() => setChipsFlown(true)),
    )
    return () => cancelAnimationFrame(r)
  }, [step])

  const goto = (s: number) => {
    setPlaying(false)
    setStep(Math.max(0, Math.min(DEMO_STEPS.length - 1, s)))
  }

  return (
    <div className="stage">
      <div className="stage-canvas">
        <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker
              id="ah-gold"
              markerWidth="9"
              markerHeight="9"
              refX="7"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L7,3 L0,6 Z" fill="var(--color-proposal)" />
            </marker>
            <marker
              id="ah-cyan"
              markerWidth="9"
              markerHeight="9"
              refX="7"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L7,3 L0,6 Z" fill="var(--color-data)" />
            </marker>
            <marker
              id="ah-purple"
              markerWidth="9"
              markerHeight="9"
              refX="7"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L7,3 L0,6 Z" fill="var(--color-supply)" />
            </marker>
          </defs>

          {/* 泳道 */}
          {LAYERS.map((l) => {
            const y = LAYER_Y[l.key]
            return (
              <g key={l.key} className="lane">
                <line x1={190} y1={y} x2={VW - 20} y2={y} className="lane-line" />
                <text x={40} y={y - 8} className="lane-label">
                  {l.label}
                </text>
                <text x={40} y={y + 12} className="lane-role">
                  {l.role}
                </text>
              </g>
            )
          })}

          {/* RepChain 汇聚点 */}
          <g className="chain-anchor">
            <circle cx={CHAIN.x} cy={CHAIN.y} r={22} className="chain-core" />
            <text x={CHAIN.x} y={CHAIN.y + 4} className="chain-core-label">
              ▲
            </text>
            <text x={CHAIN.x} y={CHAIN.y + 40} className="chain-name">
              RepChain
            </text>
          </g>

          {/* 光箭（当前步） */}
          <g key={`arrows-${step}`}>
            {cur.arrows.map((a, i) => {
              const p1 = positions[a.from]
              const p2 = positions[a.to]
              if (!p1 || !p2) return null
              return <ArrowLine key={i} p1={p1} p2={p2} arrow={a} delay={i * 160} />
            })}
          </g>

          {/* 节点 */}
          {Object.values(positions).map((p) => (
            <NodeGlyph key={p.node.id} pos={p} dim={!isFocused(p.node.id)} />
          ))}

          {/* 上链芯片 */}
          <g key={`chips-${step}`}>
            {(cur.chips ?? []).map((c, i) => {
              const p = positions[c.from]
              if (!p) return null
              return (
                <ChipFly
                  key={i}
                  chip={c}
                  from={p}
                  flown={chipsFlown}
                  delay={i * 260}
                />
              )
            })}
          </g>
        </svg>
      </div>

      {/* 旁白 + 控制 */}
      <div className="stage-hud">
        <div className="hud-narration">
          <div className="hud-step">{cur.title}</div>
          <p className="hud-text">{cur.narration}</p>
          <div className="hud-tags">
            {cur.tags.map((t) => (
              <span key={t} className="hud-tag">
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="hud-controls">
          <button className="hud-btn" onClick={() => goto(step - 1)} disabled={step === 0}>
            ‹ 上一步
          </button>
          <button
            className="hud-play"
            onClick={() => {
              if (step >= DEMO_STEPS.length - 1) {
                setStep(0)
                setPlaying(true)
              } else setPlaying((v) => !v)
            }}
          >
            {step >= DEMO_STEPS.length - 1 ? '↻ 重播' : playing ? '❚❚ 暂停' : '▶ 播放'}
          </button>
          <button
            className="hud-btn"
            onClick={() => goto(step + 1)}
            disabled={step >= DEMO_STEPS.length - 1}
          >
            下一步 ›
          </button>

          <div className="hud-dots">
            {DEMO_STEPS.map((s, i) => (
              <button
                key={i}
                className={`hud-dot ${i === step ? 'on' : ''} ${
                  i < step ? 'done' : ''
                }`}
                onClick={() => goto(i)}
                title={s.title}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function computePositions(): Record<string, Pos> {
  const map: Record<string, Pos> = {}
  for (const layer of LAYERS) {
    const nodes = DEMO_NODES.filter((n) => n.layer === layer.key).sort(
      (a, b) => a.order - b.order,
    )
    const n = nodes.length
    nodes.forEach((node) => {
      const x = LEFT + ((node.order + 1) / (n + 1)) * SPAN
      map[node.id] = { x, y: LAYER_Y[layer.key], node }
    })
  }
  return map
}

function NodeGlyph({ pos, dim }: { pos: Pos; dim: boolean }) {
  const { node } = pos
  const color = layerColor(node.layer)
  return (
    <g className={`node ${dim ? 'dim' : ''}`} transform={`translate(${pos.x},${pos.y})`}>
      {!dim && <circle r={30} className="node-halo" style={{ fill: color }} />}
      <circle r={20} className="node-core" style={{ stroke: color }} />
      <text className="node-credit" y={5}>
        {node.credit}
      </text>
      {node.professional && (
        <circle r={4} cx={15} cy={-15} className="node-pro" />
      )}
      <text className="node-name" y={40}>
        {node.name}
      </text>
    </g>
  )
}

function ArrowLine({
  p1,
  p2,
  arrow,
  delay,
}: {
  p1: Pos
  p2: Pos
  arrow: Arrow
  delay: number
}) {
  // 从节点边缘起止，避免压住圆
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const r = 24
  const ax = p1.x + ux * r
  const ay = p1.y + uy * r
  const bx = p2.x - ux * r
  const by = p2.y - uy * r
  const color = ARROW_COLOR[arrow.kind]
  const head =
    arrow.kind === 'fulfil' ? 'url(#ah-cyan)' : arrow.kind === 'procure' ? 'url(#ah-purple)' : 'url(#ah-gold)'

  return (
    <g className="arrow" style={{ animationDelay: `${delay}ms` }}>
      <line
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke={color}
        strokeWidth={arrow.win ? 3 : 1.6}
        strokeDasharray={arrow.kind === 'bid' ? '6 5' : undefined}
        markerEnd={head}
        className={arrow.win ? 'arrow-line win' : 'arrow-line'}
      />
      {/* 流动光点 */}
      <circle r={arrow.win ? 4 : 3} fill={color} className="flow">
        <animateMotion
          dur={arrow.kind === 'bid' ? '1.4s' : '1s'}
          repeatCount="indefinite"
          path={`M${ax},${ay} L${bx},${by}`}
          begin={`${delay}ms`}
        />
      </circle>
    </g>
  )
}

function ChipFly({
  chip,
  from,
  flown,
  delay,
}: {
  chip: Chip
  from: Pos
  flown: boolean
  delay: number
}) {
  const x = flown ? CHAIN.x : from.x
  const y = flown ? CHAIN.y : from.y - 26
  const color = chip.verdict === 'fulfil' ? 'var(--color-fulfil)' : 'var(--color-breach)'
  return (
    <g
      className="chip-fly"
      style={{
        transform: `translate(${x}px,${y}px)`,
        transitionDelay: `${delay}ms`,
        opacity: flown ? 0.35 : 1,
      }}
    >
      <rect x={-14} y={-10} width={28} height={20} rx={5} className="chip-body" style={{ stroke: color }} />
      <text className="chip-num" y={4}>
        {chip.score}
      </text>
    </g>
  )
}

function layerColor(layer: string): string {
  switch (layer) {
    case 'factory':
      return 'var(--color-factory)'
    case 'warehouse':
      return 'var(--color-supply)'
    case 'store':
      return 'var(--color-seller)'
    default:
      return 'var(--color-consumer)'
  }
}
