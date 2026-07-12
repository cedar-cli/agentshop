import { AlertTriangle, Clock3, FastForward, Gauge, PackageOpen } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import './restockmonitor.css'

/** 补库阈值：库存低于此百分比即进入自动补库触发区 */
const THRESHOLD_PCT = 15
/** 每个演示 tick 代表世界时钟推进的小时数 */
const HOURS_PER_TICK = 6
const TICK_MS = 1000

interface StockSpec {
  key: string
  name: string
  spec: string
  /** 初始剩余库存百分比 */
  start: number
  /** 日均消耗百分比 */
  perDay: number
}

const STOCK_SPECS: StockSpec[] = [
  { key: 'paper', name: '厨房纸', spec: '原生浆 · 3 层 · 24 卷装', start: 18, perDay: 4.6 },
  { key: 'soap', name: '无香型洗手液', spec: '补充装 · 2 瓶', start: 23, perDay: 3.1 },
]

const clampLevel = (value: number) => Math.max(1, Math.round(value * 10) / 10)

/**
 * 家庭库存实时监测。
 * 默认「自动补库执行中」——两类日用品库存随世界时钟持续下降；
 * 任一品类跌破补库阈值即高亮，并提供醒目按钮模拟库存见底、触发后续动态与交易。
 */
export function RestockMonitor({ onTrigger }: { onTrigger: () => void }) {
  const [levels, setLevels] = useState<Record<string, number>>(
    () => Object.fromEntries(STOCK_SPECS.map((item) => [item.key, item.start])),
  )
  const [elapsedHours, setElapsedHours] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLevels((current) => {
        const next: Record<string, number> = {}
        for (const item of STOCK_SPECS) {
          const decay = (item.perDay * HOURS_PER_TICK) / 24
          next[item.key] = clampLevel(current[item.key] - decay)
        }
        return next
      })
      setElapsedHours((hours) => hours + HOURS_PER_TICK)
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const items = useMemo(
    () =>
      STOCK_SPECS.map((item) => {
        const level = levels[item.key]
        const hoursUntilEmpty = Math.max(0, Math.round((level / item.perDay) * 24))
        const belowThreshold = level <= THRESHOLD_PCT
        return { ...item, level, hoursUntilEmpty, belowThreshold }
      }),
    [levels],
  )

  const breached = items.some((item) => item.belowThreshold)
  const soonest = items.reduce((min, item) => Math.min(min, item.hoursUntilEmpty), Infinity)

  return (
    <section className={`restock-monitor ${breached ? 'breached' : ''}`}>
      <header className="rm-head">
        <span className="rm-icon"><Gauge size={16} /></span>
        <div>
          <span className="eyebrow">库存实时监测 · Demo 世界时钟已推进 {elapsedHours}h</span>
          <strong>{breached ? '库存已跌破补库阈值' : '自动补库执行中 · 持续监测家庭库存'}</strong>
        </div>
        <span className={`rm-live ${breached ? 'alarm' : ''}`}>
          {breached ? <AlertTriangle size={12} /> : <span className="rm-pulse" />}
          {breached ? '待触发采购' : '监测中'}
        </span>
      </header>

      <div className="rm-items">
        {items.map((item) => (
          <div key={item.key} className={`rm-item ${item.belowThreshold ? 'low' : ''}`}>
            <div className="rm-item-top">
              <span className="rm-item-name"><PackageOpen size={13} />{item.name}</span>
              <b className="num">{item.level.toFixed(0)}%</b>
            </div>
            <div className="rm-bar">
              <span className="rm-threshold" style={{ left: `${THRESHOLD_PCT}%` }} />
              <span className="rm-fill" style={{ width: `${item.level}%` }} />
            </div>
            <div className="rm-item-meta">
              <span>{item.spec}</span>
              <span className={item.belowThreshold ? 'warn' : ''}>
                <Clock3 size={11} />
                {item.belowThreshold ? '已达阈值' : `预计 ${item.hoursUntilEmpty}h 后耗尽`}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="rm-footer">
        <p>
          {breached
            ? '预测模型已确认补库时机。可立即模拟库存见底，触发匿名竞价、组合议价与授权内自动下单的完整交易链。'
            : `Agent 在长期授权内自主盯库，最快约 ${Number.isFinite(soonest) ? soonest : 0}h 后触达补库阈值。也可直接模拟库存见底，跳到触发点。`}
        </p>
        <button type="button" className={`rm-cta ${breached ? 'ready' : ''}`} onClick={onTrigger}>
          <FastForward size={15} />
          模拟库存见底 · 立即触发补库
        </button>
      </div>
    </section>
  )
}
