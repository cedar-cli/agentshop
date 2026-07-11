/* 轻量力导向布局：中心引力 + 成对斥力 + 连线弹簧。节点规模 ~60，逐帧可承受。 */

export interface LNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  /** 初始归一化坐标（单位圆内） */
  seedX: number
  seedY: number
}

export interface LEdge {
  from: string
  to: string
}

export class ForceLayout {
  nodes = new Map<string, LNode>()
  width = 800
  height = 600

  sync(ids: Array<{ id: string; seedX: number; seedY: number }>) {
    const present = new Set(ids.map((n) => n.id))
    for (const id of this.nodes.keys()) {
      if (!present.has(id)) this.nodes.delete(id)
    }
    for (const n of ids) {
      if (!this.nodes.has(n.id)) {
        this.nodes.set(n.id, {
          id: n.id,
          x: this.width / 2 + n.seedX * this.width * 0.4,
          y: this.height / 2 + n.seedY * this.height * 0.4,
          vx: 0,
          vy: 0,
          seedX: n.seedX,
          seedY: n.seedY,
        })
      }
    }
  }

  resize(w: number, h: number) {
    this.width = w
    this.height = h
  }

  step(edges: LEdge[], alpha = 1) {
    const nodes = [...this.nodes.values()]
    const cx = this.width / 2
    const cy = this.height / 2
    const repulse = 2600 * alpha
    const spring = 0.012 * alpha
    const gravity = 0.015 * alpha
    const restLen = Math.min(this.width, this.height) * 0.16

    // 中心引力 + 回归种子位（避免漂散）
    for (const n of nodes) {
      const sx = cx + n.seedX * this.width * 0.42
      const sy = cy + n.seedY * this.height * 0.42
      n.vx += (sx - n.x) * gravity
      n.vy += (sy - n.y) * gravity
    }

    // 成对斥力
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) {
          d2 = 1
          dx = Math.random() - 0.5
          dy = Math.random() - 0.5
        }
        const f = repulse / d2
        const d = Math.sqrt(d2)
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
    }

    // 连线弹簧
    for (const e of edges) {
      const a = this.nodes.get(e.from)
      const b = this.nodes.get(e.to)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (d - restLen) * spring
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    // 积分 + 阻尼 + 边界
    const pad = 30
    for (const n of nodes) {
      n.vx *= 0.82
      n.vy *= 0.82
      n.x += n.vx
      n.y += n.vy
      n.x = Math.max(pad, Math.min(this.width - pad, n.x))
      n.y = Math.max(pad, Math.min(this.height - pad, n.y))
    }
  }

  get(id: string): LNode | undefined {
    return this.nodes.get(id)
  }
}
