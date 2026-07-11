import {
  ArrowUp,
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
} from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { DEMO_PURCHASES, getPurchaseById, type DemoEvent } from '../../demo/demoData'
import { ReplayControls, useReplay } from '../shared/ReplayControls'
import { CounterfactualPanel } from './CounterfactualPanel'

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
}: {
  selectedId: string
  onSelect: (id: string) => void
}) {
  const purchase = getPurchaseById(selectedId) ?? DEMO_PURCHASES[0]
  const replay = useReplay(purchase.id, purchase.events.length)
  const [draft, setDraft] = useState('')
  const [customMessages, setCustomMessages] = useState<string[]>([])
  const visibleEvents = purchase.events.slice(0, replay.cursor)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = draft.trim()
    if (!value) return
    setCustomMessages((items) => [...items, value])
    setDraft('')
  }

  const grouped = useMemo(
    () => ({
      active: DEMO_PURCHASES.filter((item) => item.status !== 'completed'),
      history: DEMO_PURCHASES.filter((item) => item.status === 'completed'),
    }),
    [],
  )

  return (
    <div className="consumer-workspace">
      <aside className="purchase-rail">
        <div className="rail-title-row">
          <div>
            <span className="eyebrow">全部委托</span>
            <h3>购买历史</h3>
          </div>
          <span className="rail-count num">{DEMO_PURCHASES.length}</span>
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
          <ReplayControls
            cursor={replay.cursor}
            total={purchase.events.length}
            playing={replay.playing}
            onToggle={replay.toggle}
            onReset={replay.reset}
            onNext={replay.next}
          />
        </header>

        <div className="conversation-scroll scroll-y">
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
            placeholder="告诉 Agent 你想买什么，例如：下周出差前买一台轻薄本…"
          />
          <button type="submit" aria-label="发送需求"><ArrowUp size={18} /></button>
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

function Kpi({ label, value, accent, positive }: { label: string; value: string; accent?: boolean; positive?: boolean }) {
  return <div className={`purchase-kpi ${accent ? 'accent' : ''} ${positive ? 'positive' : ''}`}><span>{label}</span><b className="num">{value}</b></div>
}

function openingTitle(scene: string) {
  if (scene === 'passive') return '我已接管这次购买委托'
  if (scene === 'restock') return '补库条件已自动触发'
  if (scene === 'scarce') return '稀缺资源已在授权内锁定'
  if (scene === 'lowprice') return '发现可信低价，等待你的确认'
  return '二手寻源与托管验机正在执行'
}
