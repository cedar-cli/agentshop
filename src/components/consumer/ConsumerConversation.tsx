import {
  ArrowUp,
  Activity,
  Bot,
  Check,
  CheckCircle2,
  CircleDollarSign,
  MessageCircleMore,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
  Play,
  RefreshCcw,
  FastForward,
  Zap,
} from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { DEMO_PURCHASES, getPurchaseById, type DemoEvent } from '../../demo/demoData'
import { ReplayControls, useReplay } from '../shared/ReplayControls'
import { CounterfactualPanel } from './CounterfactualPanel'
import { adaptLaptopPurchase } from '../../demo/laptopRuntime'
import { DEFAULT_LAPTOP_REQUEST, useLaptopPurchase } from '../../hooks/useLaptopPurchase'
import { adaptRestockPurchase } from '../../demo/restockRuntime'
import type { HouseholdRestockRuntime } from '../../hooks/useHouseholdRestock'

const KIND_ICON = {
  user: UserRound,
  agent: Bot,
  evidence: ShieldCheck,
  'seller-message': Store,
  comparison: Sparkles,
  negotiation: MessageCircleMore,
  approval: CheckCircle2,
  payment: CircleDollarSign,
  fulfilment: PackageCheck,
  attestation: ShieldCheck,
  memory: Bot,
}

export function ConsumerConversation({
  selectedId,
  onSelect,
  restock,
}: {
  selectedId: string
  onSelect: (id: string) => void
  restock: HouseholdRestockRuntime
}) {
  const basePurchase = getPurchaseById(selectedId) ?? DEMO_PURCHASES[0]
  const laptop = useLaptopPurchase()
  const isLaptop = basePurchase.id === 'laptop-trip'
  const isRestock = basePurchase.id === 'paper-restock'
  const purchase = isLaptop
    ? adaptLaptopPurchase(basePurchase, laptop.events)
    : isRestock
      ? adaptRestockPurchase(basePurchase, restock.events)
      : basePurchase
  const replay = useReplay(laptop.transactionId ?? restock.transactionId ?? purchase.id, purchase.events.length)
  const [draft, setDraft] = useState('')
  const [customMessages, setCustomMessages] = useState<string[]>([])
  const visibleEvents = purchase.events.slice(0, replay.cursor)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = draft.trim()
    if (!value) return
    if (isRestock) return
    if (isLaptop) {
      laptop.start(value)
      setDraft('')
      return
    }
    setCustomMessages((items) => [...items, value])
    setDraft('')
  }

  const purchases = useMemo(
    () => DEMO_PURCHASES.map((item) => item.id === purchase.id ? purchase : item),
    [purchase],
  )
  const grouped = useMemo(
    () => ({
      active: purchases.filter((item) => item.status !== 'completed'),
      history: purchases.filter((item) => item.status === 'completed'),
    }),
    [purchases],
  )

  return (
    <div className="consumer-workspace">
      <aside className="purchase-rail">
        <div className="rail-title-row">
          <div>
            <span className="eyebrow">全部委托</span>
            <h3>购买历史</h3>
          </div>
          <span className="rail-count num">{purchases.length}</span>
        </div>

        <HistoryGroup label="进行中" items={grouped.active} selectedId={purchase.id} onSelect={onSelect} />
        <HistoryGroup label="已完成" items={grouped.history} selectedId={purchase.id} onSelect={onSelect} />
      </aside>

      <section className="conversation-panel">
        <header className="conversation-head">
          <div className="conversation-product">
            <span className={`status-dot status-${purchase.status}`} />
            <div>
              <h3>{purchase.title}</h3>
              <div className="conversation-meta">
                <span>{purchase.sceneLabel}</span>
                <span>{purchase.authorization}</span>
                <span className="num">可信度 {purchase.trustScore}</span>
              </div>
            </div>
          </div>
          {isLaptop ? (
            <LaptopControls
              phase={laptop.phase}
              awaitingApproval={laptop.awaitingApproval}
              approving={laptop.approving}
              completed={laptop.phase === 'completed'}
              llmCount={laptop.events.filter((event) => event.payload.generatedBy === 'llm').length}
              fallbackCount={laptop.events.filter((event) => event.payload.generatedBy === 'fallback').length}
              onStart={() => laptop.start(DEFAULT_LAPTOP_REQUEST)}
              onApprove={() => void laptop.approve()}
              replay={replay}
              total={purchase.events.length}
            />
          ) : isRestock ? (
            <RestockControls
              phase={restock.phase}
              onStart={restock.start}
              replay={replay}
              total={purchase.events.length}
            />
          ) : (
            <ReplayControls
              cursor={replay.cursor}
              total={purchase.events.length}
              playing={replay.playing}
              onToggle={replay.toggle}
              onReset={replay.reset}
              onNext={replay.next}
            />
          )}
        </header>

        <div className="conversation-scroll scroll-y">
          {isRestock && <AutonomousBanner phase={restock.phase} />}
          <div className="conversation-opening">
            <span className="opening-icon"><Bot size={18} /></span>
            <div>
              <strong>{openingTitle(purchase.scene)}</strong>
              <p>{purchase.trigger}。{purchase.result}</p>
            </div>
          </div>

          <div className="audit-heading">
            <span className="eyebrow">可审计决策日志</span>
            <span className="audit-note">规则 · 证据 · 动作 · 影响</span>
          </div>

          <ol className="event-stream">
            {visibleEvents.map((event, index) => (
              <EventRow key={event.id} event={event} active={replay.playing && index === visibleEvents.length - 1} />
            ))}
          </ol>

          {(isLaptop ? laptop.error : isRestock ? restock.error : undefined) && (
            <div className="runtime-error">{isLaptop ? laptop.error : restock.error} · 已保留确定性场景，可重新执行。</div>
          )}

          {customMessages.map((message, index) => (
            <div className="custom-exchange" key={`${message}-${index}`}>
              <div className="custom-user"><span>{message}</span><UserRound size={15} /></div>
              <div className="custom-agent"><Bot size={15} /><span>收到。我会先提取硬约束，再从 RepChain 读取可信履约记录；任何商家返点都不会进入决策权重。</span></div>
            </div>
          ))}
        </div>

        <form className="agent-composer" onSubmit={submit}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="向消费 Agent 描述需求"
            disabled={isRestock}
            placeholder={isRestock ? '自主补库由库存预测触发，无需输入购买指令' : isLaptop ? DEFAULT_LAPTOP_REQUEST : '告诉 Agent 你想买什么…'}
          />
          <button type="submit" aria-label="发送需求" disabled={isRestock}><ArrowUp size={18} /></button>
        </form>
      </section>

      <aside className="decision-inspector scroll-y">
        <div className="inspector-block">
          <span className="eyebrow">本次任务</span>
          <h3>{purchase.product}</h3>
          <div className="purchase-kpis">
            <Kpi label="预算" value={`¥${purchase.budget.toLocaleString()}`} />
            <Kpi label="成交" value={`¥${purchase.paid.toLocaleString()}`} accent />
            <Kpi label="总收益" value={`¥${purchase.saved.toLocaleString()}`} positive />
          </div>
          <div className="constraint-list">
            {purchase.constraints.map((constraint) => <span key={constraint}><Check size={12} />{constraint}</span>)}
          </div>
        </div>

        <CounterfactualPanel purchase={purchase} />

        <div className="inspector-block memory-block">
          <span className="eyebrow">长期记忆更新</span>
          <p>{purchase.memory}</p>
        </div>
      </aside>
    </div>
  )
}

function HistoryGroup({
  label,
  items,
  selectedId,
  onSelect,
}: {
  label: string
  items: typeof DEMO_PURCHASES
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="history-group">
      <span className="history-label">{label}</span>
      <div className="history-list">
        {items.map((item) => (
          <button key={item.id} type="button" className={selectedId === item.id ? 'on' : ''} onClick={() => onSelect(item.id)}>
            <span className={`history-icon scene-${item.scene}`}><PackageCheck size={15} /></span>
            <span className="history-copy">
              <strong>{item.title}</strong>
              <small>{item.statusLabel} · {item.date}</small>
            </span>
            <span className="history-price num">¥{item.paid.toLocaleString()}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function EventRow({ event, active }: { event: DemoEvent; active: boolean }) {
  const Icon = KIND_ICON[event.kind]
  return (
    <li className={`event-row event-${event.kind} ${active ? 'active' : ''}`}>
      <span className="event-node"><Icon size={14} /></span>
      <div className="event-body">
        <div className="event-title-row">
          <strong>{event.title}</strong>
          {event.origin && <span className={`event-origin origin-${event.origin}`}>{event.origin === 'llm' ? 'LLM' : event.origin === 'simulation' ? '模拟' : '规则'}</span>}
          <span>{event.actor}</span>
          <time className="num">{event.time}</time>
        </div>
        <p>{event.body}</p>
        {(event.evidence || event.impact) && (
          <div className="event-evidence">
            {event.evidence && <span><ShieldCheck size={12} />{event.evidence}</span>}
            {event.impact && <b>{event.impact}</b>}
          </div>
        )}
      </div>
    </li>
  )
}

function RestockControls({
  phase,
  onStart,
  replay,
  total,
}: {
  phase: 'idle' | 'queued' | 'running' | 'completed' | 'failed'
  onStart: () => void
  replay: ReturnType<typeof useReplay>
  total: number
}) {
  if (phase === 'queued' || phase === 'running') {
    return <div className="runtime-running autonomous"><Activity size={14} className="runtime-spin" />自主补库执行中</div>
  }
  if (phase === 'completed') {
    return (
      <div className="runtime-completed-controls">
        <ReplayControls cursor={replay.cursor} total={total} playing={replay.playing} onToggle={replay.toggle} onReset={replay.reset} onNext={replay.next} />
        <button type="button" className="runtime-icon-button" onClick={onStart} title="重新演示" aria-label="重新演示家庭补库"><RefreshCcw size={14} /></button>
      </div>
    )
  }
  return (
    <div className="restock-demo-control">
      <span>演示控制 · 非购买指令</span>
      <button type="button" className="runtime-action autonomous" onClick={onStart}>
        <FastForward size={14} />推进到库存触发点
      </button>
    </div>
  )
}

function AutonomousBanner({ phase }: { phase: 'idle' | 'queued' | 'running' | 'completed' | 'failed' }) {
  const completed = phase === 'completed'
  const running = phase === 'queued' || phase === 'running'
  return (
    <div className={`autonomous-banner ${completed ? 'completed' : running ? 'running' : ''}`}>
      <span className="autonomous-icon"><Zap size={15} /></span>
      <div>
        <strong>AUTONOMOUS MODE</strong>
        <p>{completed ? 'Agent 已在长期授权内自主完成购买，人类交互 0 次。' : running ? '没有人类采购指令，库存预测已触发自主执行。' : 'Agent 持续监测家庭库存，达到阈值后将自行采购。'}</p>
      </div>
      <dl>
        <div><dt>触发源</dt><dd>库存预测模型</dd></div>
        <div><dt>授权源</dt><dd>家庭补库长期委托</dd></div>
      </dl>
    </div>
  )
}

function LaptopControls({
  phase,
  awaitingApproval,
  approving,
  completed,
  llmCount,
  fallbackCount,
  onStart,
  onApprove,
  replay,
  total,
}: {
  phase: 'idle' | 'queued' | 'running' | 'completed' | 'failed'
  awaitingApproval: boolean
  approving: boolean
  completed: boolean
  llmCount: number
  fallbackCount: number
  onStart: () => void
  onApprove: () => void
  replay: ReturnType<typeof useReplay>
  total: number
}) {
  if (awaitingApproval) {
    return (
      <button type="button" className="runtime-action approve" onClick={onApprove} disabled={approving}>
        {approving ? <Activity size={14} className="runtime-spin" /> : <CheckCircle2 size={14} />}
        {approving ? '正在确认' : '确认下单'}
      </button>
    )
  }
  if (phase === 'queued' || phase === 'running') {
    return <div className="runtime-running"><Activity size={14} className="runtime-spin" />Agent 网络采购中</div>
  }
  if (completed) {
    return (
      <div className="runtime-completed-controls">
        <div className="runtime-rerun-wrap">
          <span className={fallbackCount > 0 ? 'runtime-source fallback' : 'runtime-source llm'}>
            本次：LLM {llmCount} · fallback {fallbackCount}
          </span>
          <button type="button" className="runtime-action" onClick={onStart}>
            <RefreshCcw size={14} />重新运行真实 LLM
          </button>
        </div>
        <ReplayControls cursor={replay.cursor} total={total} playing={replay.playing} onToggle={replay.toggle} onReset={replay.reset} onNext={replay.next} />
      </div>
    )
  }
  return (
    <button type="button" className="runtime-action" onClick={onStart}>
      <Play size={14} />运行真实 LLM
    </button>
  )
}

function Kpi({ label, value, accent, positive }: { label: string; value: string; accent?: boolean; positive?: boolean }) {
  return <div className={`purchase-kpi ${accent ? 'accent' : ''} ${positive ? 'positive' : ''}`}><span>{label}</span><b className="num">{value}</b></div>
}

function openingTitle(scene: string) {
  if (scene === 'passive') return '我已接管这次购买委托'
  if (scene === 'restock') return '我正在持续监测家庭库存'
  if (scene === 'scarce') return '稀缺资源已在授权内锁定'
  if (scene === 'lowprice') return '发现可信低价，等待你的确认'
  return '二手寻源与托管验机正在执行'
}
