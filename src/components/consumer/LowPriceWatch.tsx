import {
  Ban,
  CalendarRange,
  CheckCircle2,
  History,
  Minus,
  Pause,
  Play,
  Radar,
  RotateCcw,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DemoPurchase } from '../../demo/demoData'
import { yuan } from '../../lib/format'
import {
  LOWPRICE_INITIAL_AVG,
  LOWPRICE_STEPS,
  LOWPRICE_WATCH,
  LOWPRICE_WATCHED_STORES,
  type WatchStep,
} from '../../demo/lowpriceWatch'
import { EventRow } from './EventRow'
import './lowpricewatch.css'

type Mode = 'live' | 'replay'

const LIVE_STEP_MS = 1500
const REPLAY_STEP_MS = 900
const TOTAL = LOWPRICE_STEPS.length

/**
 * 高值商品蹲低价页。
 * 默认「自动蹲低价执行中」，实时决策日志动态显示 C-Agent 正盯哪家 agent 店、
 * 每家价格是涨是跌、距目标价还差多少；命中目标价后转入等待确认。
 * 「决策回放」保留原有 camera 事件链回放，可随时切换查看。
 */
export function LowPriceWatch({ purchase }: { purchase: DemoPurchase }) {
  const [mode, setMode] = useState<Mode>('live')
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [cursor, setCursor] = useState(() => purchase.events.length)
  const [replayPlaying, setReplayPlaying] = useState(false)

  const hitReached = step >= TOTAL

  useEffect(() => {
    if (mode !== 'live' || !playing) return
    if (hitReached) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => setStep((value) => value + 1), LIVE_STEP_MS)
    return () => window.clearTimeout(timer)
  }, [mode, playing, step, hitReached])

  useEffect(() => {
    if (mode !== 'replay' || !replayPlaying) return
    if (cursor >= purchase.events.length) {
      setReplayPlaying(false)
      return
    }
    const timer = window.setTimeout(() => setCursor((value) => value + 1), REPLAY_STEP_MS)
    return () => window.clearTimeout(timer)
  }, [mode, replayPlaying, cursor, purchase.events.length])

  const visible = useMemo(() => LOWPRICE_STEPS.slice(0, step), [step])
  const feed = useMemo(() => [...visible].reverse(), [visible])
  const currentAvg = visible.length ? visible[visible.length - 1].currentAvg : LOWPRICE_INITIAL_AVG
  const avgGap = currentAvg - LOWPRICE_WATCH.target

  const bestOfficialGap = useMemo(() => {
    const latestByStore = new Map<string, WatchStep>()
    for (const item of visible) if (item.official) latestByStore.set(item.storeId, item)
    let best = Infinity
    for (const item of latestByStore.values()) best = Math.min(best, item.gapToTarget)
    return best
  }, [visible])

  const status: 'running' | 'hit' | 'confirmed' = confirmed ? 'confirmed' : hitReached ? 'hit' : 'running'

  const liveReset = () => {
    setStep(0)
    setConfirmed(false)
    setPlaying(true)
  }

  const toggleReplay = () => {
    if (cursor >= purchase.events.length) {
      setCursor(0)
      setReplayPlaying(true)
    } else {
      setReplayPlaying((value) => !value)
    }
  }

  return (
    <div className="lpw">
      <div className={`lpw-banner ${status}`}>
        <span className="lpw-banner-icon">
          {status === 'confirmed' ? <CheckCircle2 size={16} /> : status === 'hit' ? <Target size={16} /> : <Radar size={16} />}
        </span>
        <div className="lpw-banner-copy">
          <strong>
            {status === 'confirmed'
              ? '已确认下单 · 交易进入托管履约'
              : status === 'hit'
                ? '发现可信低价 · 等待你确认'
                : '自动蹲低价执行中'}
          </strong>
          <p>
            {status === 'confirmed'
              ? '按你的确认锁定券后 ¥4,699，托管支付后由履约与鉴证 Agent 接管。'
              : status === 'hit'
                ? '云仓·旗舰店券后 ¥4,699 命中目标价，全新未激活且官方保修，库存已锁定 20 分钟。'
                : `C-Agent 正实时盯 ${LOWPRICE_WATCHED_STORES.length} 家 agent 店的价格波动，只在可信官方渠道跌破目标价时提醒。`}
          </p>
        </div>
        {status === 'hit' && (
          <button type="button" className="lpw-confirm" onClick={() => setConfirmed(true)}>
            <CheckCircle2 size={14} />确认下单 ¥4,699
          </button>
        )}
        {status === 'running' && (
          <span className="lpw-gap-flag">
            距目标价还差{' '}
            <b className="num">{Number.isFinite(bestOfficialGap) && bestOfficialGap > 0 ? yuan(bestOfficialGap) : '—'}</b>
          </span>
        )}
      </div>

      <div className="lpw-stats">
        <Stat icon={<CalendarRange size={12} />} label="全年平均价" value={yuan(LOWPRICE_WATCH.annualAvg)} />
        <Stat icon={<History size={12} />} label="历史平均价" value={yuan(LOWPRICE_WATCH.historyAvg)} />
        <Stat icon={<Target size={12} />} label="目标价" value={`≤ ${yuan(LOWPRICE_WATCH.target)}`} accent />
        <Stat
          icon={<TrendingDown size={12} />}
          label="当前平均价"
          value={yuan(currentAvg)}
          live
          note={avgGap > 0 ? `高于目标 ¥${avgGap}` : `已低于目标 ¥${Math.abs(avgGap)}`}
        />
      </div>

      <div className="lpw-toolbar">
        <div className="lpw-modes">
          <button type="button" className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>
            <Radar size={12} />实时盯价
          </button>
          <button type="button" className={mode === 'replay' ? 'on' : ''} onClick={() => setMode('replay')}>
            <History size={12} />决策回放
          </button>
        </div>
        {mode === 'live' ? (
          <div className="lpw-controls">
            <button
              type="button"
              className="lpw-play"
              onClick={() => (hitReached ? liveReset() : setPlaying((value) => !value))}
            >
              {hitReached ? <RotateCcw size={13} /> : playing ? <Pause size={13} /> : <Play size={13} />}
              <span>{hitReached ? '重新盯价' : playing ? '暂停' : '继续'}</span>
            </button>
            <span className="lpw-progress num">{Math.min(step, TOTAL)}/{TOTAL}</span>
          </div>
        ) : (
          <div className="lpw-controls">
            <button type="button" className="lpw-play" onClick={toggleReplay}>
              {cursor >= purchase.events.length ? <RotateCcw size={13} /> : replayPlaying ? <Pause size={13} /> : <Play size={13} />}
              <span>{cursor >= purchase.events.length ? '重播' : replayPlaying ? '暂停' : '播放'}</span>
            </button>
            <span className="lpw-progress num">{cursor}/{purchase.events.length}</span>
          </div>
        )}
      </div>

      {mode === 'live' ? (
        <div className="lpw-board">
          <div className="lpw-board-head">
            <span className="eyebrow">实时盯盘 · 决策日志</span>
            <span className="lpw-board-note">盯哪家 · 涨/跌 · 距目标差额</span>
          </div>
          {feed.length === 0 ? (
            <p className="lpw-empty">正在接入各 agent 店的实时价格信号…</p>
          ) : (
            <ul className="lpw-log">
              {feed.map((item) => (
                <WatchRow key={item.seq} item={item} latest={item.seq === step} />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="lpw-replay">
          <div className="conversation-opening">
            <span className="opening-icon"><Radar size={18} /></span>
            <div>
              <strong>蹲低价决策链回放</strong>
              <p>{purchase.trigger}。{purchase.result}</p>
            </div>
          </div>
          <div className="audit-heading">
            <span className="eyebrow">可审计决策日志</span>
            <span className="audit-note">规则 · 证据 · 动作 · 影响</span>
          </div>
          <ol className="event-stream">
            {purchase.events.slice(0, cursor).map((event, index) => (
              <EventRow key={event.id} event={event} active={replayPlaying && index === cursor - 1} />
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  accent,
  live,
  note,
}: {
  icon: ReactNode
  label: string
  value: string
  accent?: boolean
  live?: boolean
  note?: string
}) {
  return (
    <div className={`lpw-stat ${accent ? 'accent' : ''} ${live ? 'live' : ''}`}>
      <span className="lpw-stat-label">{icon}{label}</span>
      <b className="num">{value}</b>
      {note && <em className="lpw-stat-note">{note}</em>}
    </div>
  )
}

function WatchRow({ item, latest }: { item: WatchStep; latest: boolean }) {
  const DirIcon = item.direction === 'down' ? TrendingDown : item.direction === 'up' ? TrendingUp : Minus
  return (
    <li className={`lpw-row dir-${item.direction} ${item.excluded ? 'excluded' : ''} ${item.hit ? 'hit' : ''} ${latest ? 'latest' : ''}`}>
      <span className="lpw-row-time num">{item.time}</span>
      <div className="lpw-row-main">
        <div className="lpw-row-head">
          <span className="lpw-store">{item.storeName}</span>
          <span className="lpw-credit num">信 {item.credit}</span>
          {item.excluded ? (
            <span className="lpw-badge excl"><Ban size={9} />非官方</span>
          ) : (
            <span className="lpw-badge ok"><ShieldCheck size={9} />官方保修</span>
          )}
          <span className="lpw-price num">
            {yuan(item.to)}
            <em className={`lpw-delta ${item.direction}`}>
              <DirIcon size={11} />
              {item.direction === 'flat' ? '持平' : `${item.direction === 'down' ? '↓' : '↑'}¥${Math.abs(item.delta)}`}
            </em>
          </span>
        </div>
        <p className="lpw-note">{item.note}</p>
      </div>
      {item.hit ? (
        <span className="lpw-tag hit"><Target size={10} />命中</span>
      ) : item.excluded ? (
        <span className="lpw-tag excl">已排除</span>
      ) : (
        <span className="lpw-tag gap">差 {yuan(Math.max(0, item.gapToTarget))}</span>
      )}
    </li>
  )
}
