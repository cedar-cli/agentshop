import { useMemo, useState } from 'react'
import type { Agent } from '../../core/types'

interface Params {
  commission: number // 佣金比例上调 %
  deposit: number // 保证金增加（万）
  speed: number // 配送时效提升（小时）
  price: number // 价格下调 %
}

const DEFAULT: Params = { commission: 0, deposit: 0, speed: 0, price: 0 }

export function StrategySandbox({ seller }: { seller: Agent }) {
  const [p, setP] = useState<Params>(DEFAULT)
  const [applied, setApplied] = useState(false)

  const sim = useMemo(() => simulate(p, seller), [p, seller])
  const set = (k: keyof Params, v: number) => {
    setP((prev) => ({ ...prev, [k]: v }))
    setApplied(false)
  }

  return (
    <div className="sandbox">
      <div className="sb-controls">
        <div className="eyebrow">策略参数 · 不用真金白银试错</div>
        <Slider label="佣金比例上调" unit="%" min={0} max={10} step={0.5} value={p.commission} onChange={(v) => set('commission', v)} />
        <Slider label="保证金增加" unit="万" min={0} max={20} step={1} value={p.deposit} onChange={(v) => set('deposit', v)} />
        <Slider label="配送时效提升" unit="h" min={0} max={12} step={1} value={p.speed} onChange={(v) => set('speed', v)} />
        <Slider label="价格下调" unit="%" min={0} max={15} step={0.5} value={p.price} onChange={(v) => set('price', v)} />

        <button
          className="sb-apply"
          onClick={() => setApplied(true)}
          disabled={applied}
        >
          {applied ? '✓ 已同步至真实 Agent 集群' : '一键上线 · 同步 Agent 集群'}
        </button>
      </div>

      <div className="sb-results">
        <div className="eyebrow">7 天经营推演（基于历史市场数据）</div>
        <div className="sb-metrics">
          <Metric label="获客量" delta={sim.customers} suffix="%" />
          <Metric label="利润" delta={sim.profit} suffix="%" />
          <Metric label="信用排名" delta={sim.rank} suffix=" 位" rankStyle />
          <Metric label="市场份额" delta={sim.share} suffix="%" />
        </div>

        <div className="sb-counter">
          <div className="eyebrow">竞品反制模拟</div>
          <p>{sim.counter}</p>
          {sim.advice && <p className="sb-advice">→ 最优应对：{sim.advice}</p>}
        </div>
      </div>
    </div>
  )
}

function simulate(p: Params, seller: Agent) {
  // 简化的弹性模型：价格与时效对获客正贡献，佣金驱动分销，保证金增信
  const priceGain = p.price * 2.4
  const speedGain = p.speed * 1.6
  const commGain = p.commission * 1.1
  const depositGain = p.deposit * 0.4
  const customers = Math.round(priceGain + speedGain + commGain + depositGain)

  // 价格下调侵蚀毛利；佣金支出；保证金占用
  const profit = Math.round(
    customers * 0.6 - p.price * 3.1 - p.commission * 1.4 - p.deposit * 0.3,
  )

  const rank = Math.round((speedGain + depositGain) / 6 + priceGain / 12)
  const share = Math.round(customers * 0.35)

  const aggressive = p.price >= 6
  const counter = aggressive
    ? `竞品 Agent 监测到你降价 ${p.price}%，48h 内跟进降价 ${(p.price * 0.7).toFixed(1)}%，你的份额被回夺约 ${Math.round(p.price * 1.2)}%。`
    : p.speed >= 6
      ? `竞品短期无法匹配 ${p.speed}h 时效提升（受其上游供应链信用约束），你的时效壁垒可维持。`
      : '当前策略温和，竞品无显著反制动作。'
  const advice = aggressive
    ? '用时效+售后壁垒替代纯价格战，避免陷入囚徒困境式降价。'
    : p.commission >= 5
      ? '佣金已足够驱动分销裂变，继续上调边际收益递减。'
      : seller.vector.afterSales < 70
        ? '优先补强售后维度，它是你当前信用短板。'
        : ''

  return { customers, profit, rank, share, counter, advice }
}

function Slider({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  unit: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="sb-slider">
      <span className="sb-slider-head">
        <span>{label}</span>
        <span className="num">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
    </label>
  )
}

function Metric({
  label,
  delta,
  suffix,
  rankStyle,
}: {
  label: string
  delta: number
  suffix: string
  rankStyle?: boolean
}) {
  const positive = rankStyle ? delta > 0 : delta >= 0
  const sign = delta > 0 ? '+' : ''
  const display = rankStyle ? `${sign}${delta}` : `${sign}${delta}`
  return (
    <div className="sb-metric">
      <span className={`sb-metric-val num ${positive ? 'up' : 'down'}`}>
        {display}
        {suffix}
      </span>
      <span className="sb-metric-label">{label}</span>
    </div>
  )
}
