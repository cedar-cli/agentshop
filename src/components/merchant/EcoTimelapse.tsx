import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Sprout,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  UserRound,
} from 'lucide-react'
import { useWorld } from '../../core/store'
import {
  ARCHETYPE_LABEL,
  ECO_YEAR_DAYS,
  FACTORS,
  createSim,
  dayLabel,
  diagnose,
  ranking,
  stepSim,
  type EcoDeal,
  type EcoSim,
  type FactorKey,
} from '../../core/evolution'
import { CATEGORIES, type Category } from '../../core/types'
import './eco.css'

const STEP_MS = 165 // 每个模拟步的真实时长（×1）≈10.7s/年

const FACTOR_LABEL: Record<FactorKey, string> = Object.fromEntries(
  FACTORS.map((f) => [f.key, f.label]),
) as Record<FactorKey, string>

function buildSim(category: Category): EcoSim {
  const agents = useWorld.getState().agents
  const sellers = Object.values(agents)
    .filter((a) => a.role === 'seller')
    .map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      credit: s.credit,
    }))
  return createSim(sellers, category, 42)
}

/**
 * 一年只需十秒：事件驱动的生态演化。
 * persona 消费者带真实意图持续下单 → 匹配沟通 → 满意/差评/流失，
 * 结果按维度归因，驱动商家信誉与排名；随时可查看任一商家的诊断与改进建议。
 */
export function EcoTimelapse() {
  const [category, setCategory] = useState<Category>('3C数码')
  const [nonce, setNonce] = useState(0)
  const [sim, setSim] = useState<EcoSim>(() => buildSim('3C数码'))
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 品类切换 / 重置 → 重建模拟
  useEffect(() => {
    setSim(buildSim(category))
    setPlaying(false)
    setSelectedId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, nonce])

  const done = sim.day >= ECO_YEAR_DAYS

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last: number | null = null
    let acc = 0
    const tick = (t: number) => {
      if (last != null) acc += (t - last) * speed
      last = t
      if (acc >= STEP_MS) {
        acc = 0
        setSim((prev) => (prev.day >= ECO_YEAR_DAYS ? prev : stepSim(prev)))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed])

  useEffect(() => {
    if (done) setPlaying(false)
  }, [done])

  const board = useMemo(() => ranking(sim), [sim])
  const selected =
    board.find((m) => m.id === selectedId) ?? board[0] ?? null
  const report = selected ? diagnose(selected, selected.rank) : null
  const progress = Math.min(1, sim.day / ECO_YEAR_DAYS)
  const leader = board[0]
  const wiped = board.filter((m) => m.flagged).length

  const toggle = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (done) setSim(buildSim(category))
    setPlaying(true)
  }

  const reset = () => {
    setPlaying(false)
    setNonce((n) => n + 1)
  }

  return (
    <div className="eco">
      <header className="eco-head">
        <div className="eco-title">
          <span className="eyebrow">生态演化 · 一年只需十秒</span>
          <h3>{category} · 交易驱动的信誉竞速</h3>
        </div>
        <div className="eco-cats">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={cat === category ? 'on' : ''}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="eco-controls">
          <button type="button" className="eco-play" onClick={toggle}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
            <span>{playing ? '暂停' : done ? '重播一年' : '快进一年'}</span>
          </button>
          <div className="eco-speed">
            {[1, 2].map((s) => (
              <button
                key={s}
                type="button"
                className={speed === s ? 'on' : ''}
                onClick={() => setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
          <button type="button" className="eco-reset" onClick={reset} title="重置">
            <RotateCcw size={13} />
          </button>
        </div>
      </header>

      <div className="eco-timeline">
        <div className="eco-day num">{dayLabel(sim.day)}</div>
        <div className="eco-progress">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="eco-summary">
          <span className="eco-leader">
            <Sprout size={12} />榜首 {leader?.name ?? '—'}
          </span>
          <span className="eco-wiped">
            <TrendingDown size={12} />枯萎沉底 {wiped}
          </span>
        </div>
      </div>

      <div className="eco-body">
        {/* 左：交易流 */}
        <section className="eco-stream">
          <div className="eco-panel-title">
            <span className="eyebrow">消费者 ↔ 商家 · 实时交易流</span>
            <span className="num">{sim.deals.length}</span>
          </div>
          <ol className="eco-deals">
            {sim.deals.length === 0 && (
              <li className="eco-deal-empty">点击「快进一年」，看 persona 带着真实意图下单…</li>
            )}
            {sim.deals.map((deal) => (
              <DealRow key={deal.id} deal={deal} />
            ))}
          </ol>
        </section>

        {/* 中：竞速榜 */}
        <section className="eco-race">
          <div className="eco-panel-title">
            <span className="eyebrow">信用竞速榜 · 点击查看诊断</span>
          </div>
          <div className="eco-race-list">
            {board.map((m) => {
              const kind = m.flagged
                ? 'flagged'
                : m.credit >= m.startCredit
                  ? 'up'
                  : 'down'
              return (
                <button
                  type="button"
                  key={m.id}
                  className={`eco-row ${kind} ${m.rank === 1 ? 'leader' : ''} ${
                    selected?.id === m.id ? 'selected' : ''
                  }`}
                  onClick={() => setSelectedId(m.id)}
                >
                  <span className="eco-rank num">{m.rank}</span>
                  <span className="eco-name">{m.name}</span>
                  <span className="eco-arche">{ARCHETYPE_LABEL[m.archetype]}</span>
                  <div className="eco-bar-track">
                    <span className="eco-bar" style={{ width: `${m.credit}%` }} />
                  </div>
                  <span className="eco-credit num">{Math.round(m.credit)}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* 右：诊断报告 */}
        <section className="eco-report">
          {report ? (
            <>
              <div className="eco-panel-title">
                <span className="eyebrow">演化诊断 · {report.name}</span>
                <span className="eco-arche-badge">{ARCHETYPE_LABEL[report.archetype]}</span>
              </div>

              <div className="eco-kpis">
                <div className="eco-kpi">
                  <b className="num">{report.deals}</b>
                  <span>成交笔数</span>
                </div>
                <div className="eco-kpi">
                  <b className="num">{report.satisfaction}%</b>
                  <span>满意率</span>
                </div>
                <div className="eco-kpi">
                  <b className="num">
                    {report.creditFrom}
                    <ArrowRight size={11} />
                    {report.creditNow}
                  </b>
                  <span>信用变化</span>
                </div>
              </div>

              <div className="eco-attr">
                <span className="eyebrow">失分归因</span>
                {report.issueBreakdown.length === 0 ? (
                  <div className="eco-attr-none">
                    <ThumbsUp size={13} />无明显失分，履约稳定
                  </div>
                ) : (
                  <div className="eco-attr-bars">
                    {report.issueBreakdown.map((b) => {
                      const max = report.issueBreakdown[0].count || 1
                      const isTop = b.key === report.topIssue
                      return (
                        <div
                          key={b.key}
                          className={`eco-attr-row ${isTop ? 'top' : ''}`}
                        >
                          <span className="eco-attr-label">
                            <ThumbsDown size={10} />
                            {FACTOR_LABEL[b.key]}
                          </span>
                          <span className="eco-attr-track">
                            <i style={{ width: `${(b.count / max) * 100}%` }} />
                          </span>
                          <span className="eco-attr-count num">{b.count}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <p className="eco-report-summary">{report.summary}</p>

              <div className="eco-advice">
                <span className="eco-advice-icon">
                  <Lightbulb size={14} />
                </span>
                <div>
                  <span className="eyebrow">改进建议</span>
                  <p>{report.advice}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="eco-report-empty">
              <UserRound size={20} />
              <p>选择一个商家查看诊断</p>
            </div>
          )}
        </section>
      </div>

      <p className="eco-foot">
        {done
          ? '一年演完：优质履约的商家靠满意成交爬上榜首，短板商家被差评与流失逐步拖垮、沉底——每一次涨跌都能追溯到具体原因（描述/服务/时效/选品/推广/价格），并给出改进方向。'
          : '演化进行中：每一笔交易都由带真实意图的 persona 驱动，结果按维度归因，实时改写商家信誉与排名。'}
      </p>
    </div>
  )
}

function DealRow({ deal }: { deal: EcoDeal }) {
  const tag =
    deal.outcome === 'happy'
      ? '满意'
      : deal.outcome === 'unhappy'
        ? `差评 · ${deal.issue ? FACTOR_LABEL[deal.issue] : ''}`
        : `流失 · ${deal.issue ? FACTOR_LABEL[deal.issue] : ''}`
  const Icon = deal.outcome === 'happy' ? ThumbsUp : ThumbsDown
  return (
    <li className={`eco-deal ${deal.outcome}`}>
      <span className="eco-deal-persona">{deal.personaLabel}</span>
      <span className="eco-deal-intent">「{deal.intent}」</span>
      <span className="eco-deal-flow">
        <ArrowRight size={11} />
        {deal.merchantName}
      </span>
      <span className="eco-deal-tag">
        <Icon size={10} />
        {tag}
      </span>
    </li>
  )
}
