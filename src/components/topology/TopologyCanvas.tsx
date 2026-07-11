import { useEffect, useRef, useState } from 'react'
import type { Agent } from '../../core/types'
import { ForceLayout } from '../../lib/forceLayout'
import { PALETTE, roleCanvasColor, hexToRgba } from '../../lib/palette'
import './topocanvas.css'

export interface TopoLink {
  from: string
  to: string
  status: string
  upstream: boolean
}

interface Props {
  nodes: Agent[]
  links: TopoLink[]
  onSelect?: (a: Agent) => void
  selectedId?: string | null
  showHeat?: boolean
  /** 上链粒子锚点（右上），最近鉴证从卖家飞向此处 */
  chainAnchor?: boolean
  attestationPulses?: Array<{ id: string; sellerId: string; verdict: string }>
  /** 仅这些节点保持明亮，其余降噪变暗（不传则全部明亮） */
  activeIds?: Set<string>
}

interface Particle {
  x: number
  y: number
  tx: number
  ty: number
  life: number
  color: string
}

export function TopologyCanvas({
  nodes,
  links,
  onSelect,
  selectedId,
  showHeat = true,
  chainAnchor = false,
  attestationPulses = [],
  activeIds,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef(new ForceLayout())
  const nodesRef = useRef(nodes)
  const linksRef = useRef(links)
  const selRef = useRef(selectedId)
  const activeRef = useRef(activeIds)
  const hoverRef = useRef<string | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const seenAtt = useRef(new Set<string>())
  const dashRef = useRef(0)
  const [hover, setHover] = useState<{ a: Agent; x: number; y: number } | null>(
    null,
  )

  nodesRef.current = nodes
  linksRef.current = links
  selRef.current = selectedId
  activeRef.current = activeIds

  // 同步布局节点集
  useEffect(() => {
    layoutRef.current.sync(
      nodes.map((n) => ({ id: n.id, seedX: n.x, seedY: n.y })),
    )
  }, [nodes])

  // 新鉴证 → 生成上链粒子
  useEffect(() => {
    if (!chainAnchor) return
    const L = layoutRef.current
    for (const p of attestationPulses) {
      if (seenAtt.current.has(p.id)) continue
      seenAtt.current.add(p.id)
      const src = L.get(p.sellerId)
      if (!src) continue
      particlesRef.current.push({
        x: src.x,
        y: src.y,
        tx: L.width - 12,
        ty: 12,
        life: 1,
        color: p.verdict === 'fulfil' ? PALETTE.fulfil : PALETTE.breach,
      })
    }
    if (seenAtt.current.size > 400) seenAtt.current = new Set()
  }, [attestationPulses, chainAnchor])

  // 尺寸
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = r.width * dpr
      canvas.height = r.height * dpr
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      layoutRef.current.resize(r.width, r.height)
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // 渲染循环
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0

    const render = () => {
      const L = layoutRef.current
      L.step(linksRef.current, 1)
      dashRef.current = (dashRef.current + 0.6) % 16
      const W = L.width
      const H = L.height
      ctx.clearRect(0, 0, W, H)

      if (showHeat) drawHeat(ctx, nodesRef.current, L, W, H)

      // 连线
      for (const e of linksRef.current) {
        const a = L.get(e.from)
        const b = L.get(e.to)
        if (!a || !b) continue
        const bidding = e.status === 'bidding'
        const color = e.upstream
          ? PALETTE.supply
          : bidding
            ? PALETTE.proposal
            : PALETTE.data
        ctx.beginPath()
        ctx.strokeStyle = hexToRgba(color, bidding ? 0.28 : 0.55)
        ctx.lineWidth = bidding ? 1 : 1.6
        if (bidding) {
          ctx.setLineDash([4, 4])
          ctx.lineDashOffset = -dashRef.current
        } else {
          ctx.setLineDash([])
        }
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        ctx.setLineDash([])
        // 流动光点（成交/履约链路）
        if (!bidding) {
          const t = (dashRef.current / 16 + 0.3) % 1
          ctx.beginPath()
          ctx.fillStyle = color
          ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 2, 0, 7)
          ctx.fill()
        }
      }

      // 节点
      for (const n of nodesRef.current) {
        const p = L.get(n.id)
        if (!p) continue
        const base = roleCanvasColor(n.role)
        const r =
          n.role === 'factory'
            ? 9
            : n.role === 'supply'
              ? 7
              : n.role === 'seller'
                ? 4 + (n.credit / 100) * 5
                : 4
        const dim = n.flagged
        const isSel = selRef.current === n.id
        const isHover = hoverRef.current === n.id
        // 降噪：不在活跃链路上的节点变暗（但选中/悬停/风控节点始终清晰）
        const idle =
          !!activeRef.current &&
          !activeRef.current.has(n.id) &&
          !dim &&
          !isSel &&
          !isHover

        // 光晕
        if (!dim && !idle) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3)
          g.addColorStop(0, hexToRgba(base, 0.5))
          g.addColorStop(1, hexToRgba(base, 0))
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(p.x, p.y, r * 3, 0, 7)
          ctx.fill()
        }

        ctx.globalAlpha = idle ? 0.28 : 1
        ctx.beginPath()
        ctx.fillStyle = dim ? PALETTE.dim : base
        ctx.arc(p.x, p.y, r, 0, 7)
        ctx.fill()
        ctx.globalAlpha = 1

        if (dim) {
          ctx.strokeStyle = PALETTE.breach
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
        if (isSel || isHover) {
          ctx.beginPath()
          ctx.strokeStyle = isSel ? PALETTE.text : hexToRgba(base, 0.9)
          ctx.lineWidth = isSel ? 2 : 1.5
          ctx.arc(p.x, p.y, r + 5, 0, 7)
          ctx.stroke()
        }
      }

      // 上链粒子
      const alive: Particle[] = []
      for (const pt of particlesRef.current) {
        pt.x += (pt.tx - pt.x) * 0.08
        pt.y += (pt.ty - pt.y) * 0.08
        pt.life -= 0.012
        const near = Math.abs(pt.tx - pt.x) < 8 && Math.abs(pt.ty - pt.y) < 8
        if (pt.life > 0 && !near) {
          alive.push(pt)
          ctx.beginPath()
          ctx.fillStyle = pt.color
          ctx.shadowColor = pt.color
          ctx.shadowBlur = 8
          ctx.arc(pt.x, pt.y, 3, 0, 7)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }
      particlesRef.current = alive

      if (chainAnchor) {
        ctx.fillStyle = hexToRgba(PALETTE.verify, 0.9)
        ctx.font = '10px monospace'
        ctx.textAlign = 'right'
        ctx.fillText('▲ RepChain', W - 10, 24)
      }

      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [showHeat, chainAnchor])

  // 交互：命中检测
  const hit = (clientX: number, clientY: number): Agent | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const L = layoutRef.current
    let best: Agent | null = null
    let bestD = 16 * 16
    for (const n of nodesRef.current) {
      const p = L.get(n.id)
      if (!p) continue
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d < bestD) {
        bestD = d
        best = n
      }
    }
    return best
  }

  return (
    <div className="topo-canvas" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onMouseMove={(e) => {
          const a = hit(e.clientX, e.clientY)
          hoverRef.current = a?.id ?? null
          if (a) {
            const rect = wrapRef.current!.getBoundingClientRect()
            setHover({ a, x: e.clientX - rect.left, y: e.clientY - rect.top })
          } else setHover(null)
        }}
        onMouseLeave={() => {
          hoverRef.current = null
          setHover(null)
        }}
        onClick={(e) => {
          const a = hit(e.clientX, e.clientY)
          if (a && onSelect) onSelect(a)
        }}
      />
      {hover && (
        <div
          className="topo-tip"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="tt-name">{hover.a.name}</div>
          <div className="tt-row">
            <span>{roleLabel(hover.a.role)}</span>
            <span className="tag">{hover.a.category}</span>
          </div>
          <div className="tt-credit">
            信用 <b className="num">{hover.a.credit}</b>
            {hover.a.flagged && <span className="tt-flag">风控降级</span>}
            {hover.a.professional && <span className="tt-pro">专业鉴证</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function roleLabel(role: string) {
  return role === 'consumer'
    ? 'C-Agent 买家'
    : role === 'seller'
      ? 'S-Agent 卖家'
      : role === 'supply'
        ? '供应链 Agent'
        : '工厂 S-Agent'
}

function drawHeat(
  ctx: CanvasRenderingContext2D,
  nodes: Agent[],
  L: ForceLayout,
  W: number,
  H: number,
) {
  // 按区域聚合信用活跃度，画柔和光斑
  const regions: Record<number, { x: number; y: number; sum: number; n: number }> =
    {}
  for (const n of nodes) {
    const p = L.get(n.id)
    if (!p) continue
    const r = (regions[n.region] ??= { x: 0, y: 0, sum: 0, n: 0 })
    r.x += p.x
    r.y += p.y
    r.sum += n.flagged ? 0 : n.credit
    r.n++
  }
  for (const k of Object.keys(regions)) {
    const r = regions[+k]
    if (r.n === 0) continue
    const cx = r.x / r.n
    const cy = r.y / r.n
    const heat = r.sum / r.n / 100
    const rad = Math.min(W, H) * 0.32
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
    g.addColorStop(0, hexToRgba(PALETTE.data, 0.05 + heat * 0.09))
    g.addColorStop(1, hexToRgba(PALETTE.data, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, rad, 0, 7)
    ctx.fill()
  }
}
