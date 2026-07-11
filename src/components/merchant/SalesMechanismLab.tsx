import { Bot, Check, CircleDollarSign, Network, Play, Radio, ShieldCheck, Target, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SALES_MECHANISMS, getPurchaseById, type SalesMechanism } from '../../demo/demoData'

const ICONS: Record<SalesMechanism['id'], typeof Bot> = {
  precision: Target,
  distribution: Network,
  reputation: TrendingUp,
  broadcast: Radio,
}

export function SalesMechanismLab() {
  const [selectedId, setSelectedId] = useState<SalesMechanism['id']>('precision')
  const [activeStep, setActiveStep] = useState(0)
  const [running, setRunning] = useState(false)
  const selected = SALES_MECHANISMS.find((item) => item.id === selectedId) ?? SALES_MECHANISMS[0]
  const purchase = getPurchaseById(selected.buyerRecordId)!

  useEffect(() => {
    setActiveStep(0)
    setRunning(false)
  }, [selectedId])

  useEffect(() => {
    if (!running) return
    if (activeStep >= selected.steps.length) {
      setRunning(false)
      return
    }
    const timer = window.setTimeout(() => setActiveStep((step) => step + 1), 650)
    return () => window.clearTimeout(timer)
  }, [activeStep, running, selected.steps.length])

  const run = () => {
    setActiveStep(0)
    setRunning(true)
  }

  return (
    <div className="mechanism-lab">
      <aside className="mechanism-list">
        <header><span className="eyebrow">A2A Sales Playbook</span><h3>四种销售机制</h3></header>
        {SALES_MECHANISMS.map((item) => {
          const Icon = ICONS[item.id]
          return (
            <button type="button" key={item.id} className={selected.id === item.id ? 'on' : ''} onClick={() => setSelectedId(item.id)}>
              <span className="mechanism-number num">{item.index}</span>
              <span className="mechanism-list-icon"><Icon size={17} /></span>
              <span><strong>{item.title}</strong><small>{item.short}</small></span>
            </button>
          )
        })}
      </aside>

      <section className="mechanism-process scroll-y">
        <header className="mechanism-process-head">
          <div>
            <span className="eyebrow">{selected.index} · {selected.short}</span>
            <h3>{selected.title}</h3>
            <p>{selected.description}</p>
          </div>
          <button type="button" className="run-mechanism" onClick={run} disabled={running}>
            <Play size={15} />{running ? '运行中' : '运行机制演示'}
          </button>
        </header>

        <div className="mechanism-buyer-context">
          <span className="buyer-context-icon"><Bot size={17} /></span>
          <div><span>目标买家 Agent</span><strong>{purchase.buyerName} · {purchase.product}</strong></div>
          <div><span>匿名需求</span><strong>{purchase.constraints.slice(0, 2).join(' · ')}</strong></div>
          <div><span>当前状态</span><strong>{purchase.statusLabel}</strong></div>
        </div>

        <div className="process-heading"><span className="eyebrow">内部执行过程</span><span className="num">{activeStep}/{selected.steps.length} 已执行</span></div>
        <ol className="mechanism-steps">
          {selected.steps.map((step, index) => {
            const complete = index < activeStep
            const active = running && index === activeStep
            return (
              <li key={step.title} className={`${complete ? 'complete' : ''} ${active ? 'active' : ''}`}>
                <span className="step-index num">{complete ? <Check size={14} /> : `0${index + 1}`}</span>
                <div className="step-owner"><Bot size={13} /><span>{step.owner}</span></div>
                <div className="step-copy"><strong>{step.title}</strong><p>{step.detail}</p></div>
                <b className="step-effect">{step.effect}</b>
              </li>
            )
          })}
        </ol>

        <div className="mechanism-contract">
          <ShieldCheck size={17} />
          <div><span>可信执行边界</span><strong>{trustBoundary(selected.id)}</strong></div>
        </div>
      </section>

      <aside className="mechanism-impact scroll-y">
        <div className="impact-heading"><span className="eyebrow">影响变化</span><span className="impact-live"><i />Live simulation</span></div>
        <div className="metric-change-list">
          {selected.metrics.map((metric) => (
            <article key={metric.label}>
              <span>{metric.label}</span>
              <div><small>{metric.before}</small><b>→</b><strong>{metric.after}</strong></div>
              <em className={metric.positive ? 'positive' : 'negative'}>{metric.delta}</em>
            </article>
          ))}
        </div>

        <div className="mechanism-funnel">
          <span className="eyebrow">对买家决策集的影响</span>
          <div><span>被发现</span><i style={{ width: '100%' }} /><b className="num">100</b></div>
          <div><span>信用准入</span><i style={{ width: selected.id === 'broadcast' ? '18%' : '74%' }} /><b className="num">{selected.id === 'broadcast' ? 18 : 74}</b></div>
          <div><span>进入决策集</span><i style={{ width: '48%' }} /><b className="num">48</b></div>
          <div><span>成交</span><i style={{ width: '31%' }} /><b className="num">31</b></div>
        </div>

        <div className="mechanism-settlement">
          <CircleDollarSign size={16} />
          <div><span>单位经济结果</span><strong>{economics(selected.id)}</strong></div>
        </div>
      </aside>
    </div>
  )
}

function trustBoundary(id: SalesMechanism['id']) {
  if (id === 'precision') return '无法读取买家身份和精准底价，只能以公开约束竞争。'
  if (id === 'distribution') return '返佣规则公开、自动执行，成交前不产生佣金。'
  if (id === 'reputation') return '排名不能购买，只接受履约鉴证的加权回写。'
  return '消息必须先通过 Inbox 条件与 C-Agent 独立价值评估。'
}

function economics(id: SalesMechanism['id']) {
  if (id === 'precision') return '获客成本 ¥12 · 毛利 18.6%'
  if (id === 'distribution') return '成交返佣 3% · 结算 0 秒'
  if (id === 'reputation') return '广告支出 ¥0 · 自然准入 95%'
  return '有效意向 38% · 屏蔽率 1.4%'
}
