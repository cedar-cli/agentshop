/* 轻量力导向布局：中心引力 + 成对斥力 + 连线弹簧 + 质心回正 + 退火冷却。
 * 节点规模 ~70，逐帧可承受。
 *
 * 设计要点（修复「整体向右漂移 / 一段时间后节点飞出视野看不见」）：
 *  1. 质心回正 recenter：每步把所有节点整体平移，使质心恒定落在画布中心，
 *     从构造上消除任何净平移漂移，节点永远居中可见。
 *  2. 退火冷却 alpha：从热到冷衰减，布局会稳定成型而非永久抖动；节点集变化时回温。
 *  3. 速度钳制 + 尺寸兜底：避免斥力叠加导致数值爆炸或 NaN 把节点甩出画布。
 */

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

const MIN_SIZE = 120 // 尺寸兜底，避免 0/极小尺寸导致坐标坍缩
const MAX_SPEED = 10 // 单步位移上限，防爆炸

export class ForceLayout {
  nodes = new Map<string, LNode>()
  width = 800
  height = 600
  /** 退火系数：>0 时施加力，逐步冷却到 alphaMin */
  private alpha = 1
  private readonly alphaMin = 0.06
  private readonly alphaDecay = 0.985

  sync(ids: Array<{ id: string; seedX: number; seedY: number }>) {
    const present = new Set(ids.map((n) => n.id))
    let changed = false
    for (const id of this.nodes.keys()) {
      if (!present.has(id)) {
        this.nodes.delete(id)
        changed = true
      }
    }
    for (const n of ids) {
      if (!this.nodes.has(n.id)) {
        this.nodes.set(n.id, {
          id: n.id,
          x: this.width / 2 + n.seedX * this.width * 0.38,
          y: this.height / 2 + n.seedY * this.height * 0.38,
          vx: 0,
          vy: 0,
          seedX: n.seedX,
          seedY: n.seedY,
        })
        changed = true
      }
    }
    // 节点集变化时回温，让布局重新收敛
    if (changed) this.reheat(0.5)
  }

  resize(w: number, h: number) {
    this.width = Math.max(MIN_SIZE, w)
    this.height = Math.max(MIN_SIZE, h)
  }

  /** 回温：外部（节点/视角切换）触发重新收敛 */
  reheat(a = 0.7) {
    this.alpha = Math.max(this.alpha, a)
  }

  step(edges: LEdge[]) {
    const nodes = [...this.nodes.values()]
    if (nodes.length === 0) return

    const a = this.alpha
    const cx = this.width / 2
    const cy = this.height / 2
    const repulse = 1400 * a
    const spring = 0.02 * a
    const gravity = 0.02 * a
    const restLen = Math.min(this.width, this.height) * 0.14

    // 中心引力：回归各自种子位（保持整体铺开、避免全部挤到中心）
    for (const n of nodes) {
      const sx = cx + n.seedX * this.width * 0.4
      const sy = cy + n.seedY * this.height * 0.4
      n.vx += (sx - n.x) * gravity
      n.vy += (sy - n.y) * gravity
    }

    // 成对斥力
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const p = nodes[i]
        const q = nodes[j]
        let dx = p.x - q.x
        let dy = p.y - q.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) {
          // 重叠：用确定性微扰散开（不用 Math.random，避免每帧抖动）
          dx = (p.seedX - q.seedX) || 0.5
          dy = (p.seedY - q.seedY) || 0.5
          d2 = dx * dx + dy * dy || 1
        }
        const d = Math.sqrt(d2)
        const f = repulse / d2
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        p.vx += fx
        p.vy += fy
        q.vx -= fx
        q.vy -= fy
      }
    }

    // 连线弹簧
    for (const e of edges) {
      const p = this.nodes.get(e.from)
      const q = this.nodes.get(e.to)
      if (!p || !q) continue
      const dx = q.x - p.x
      const dy = q.y - p.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (d - restLen) * spring
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      p.vx += fx
      p.vy += fy
      q.vx -= fx
      q.vy -= fy
    }

    // 积分 + 阻尼 + 速度钳制
    for (const n of nodes) {
      n.vx *= 0.82
      n.vy *= 0.82
      // 钳制单步位移，防数值爆炸
      const sp = Math.hypot(n.vx, n.vy)
      if (sp > MAX_SPEED) {
        n.vx = (n.vx / sp) * MAX_SPEED
        n.vy = (n.vy / sp) * MAX_SPEED
      }
      n.x += n.vx
      n.y += n.vy
    }

    // 质心回正：整体平移使质心恒居画布中心 —— 彻底消除净漂移
    let mx = 0
    let my = 0
    for (const n of nodes) {
      mx += n.x
      my += n.y
    }
    mx = mx / nodes.length - cx
    my = my / nodes.length - cy
    if (Number.isFinite(mx) && Number.isFinite(my)) {
      for (const n of nodes) {
        n.x -= mx
        n.y -= my
      }
    }

    // 边界兜底（回正后极少触发，仅防个别离群点飞出）
    const pad = 26
    for (const n of nodes) {
      if (!Number.isFinite(n.x)) n.x = cx
      if (!Number.isFinite(n.y)) n.y = cy
      n.x = Math.max(pad, Math.min(this.width - pad, n.x))
      n.y = Math.max(pad, Math.min(this.height - pad, n.y))
    }

    // 冷却
    if (this.alpha > this.alphaMin) {
      this.alpha = Math.max(this.alphaMin, this.alpha * this.alphaDecay)
    }
  }

  get(id: string): LNode | undefined {
    return this.nodes.get(id)
  }
}
