import { Archive, Brain, Check, Inbox, ShieldBan, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { DEMO_INBOX } from '../../demo/demoData'

export function ConsumerInbox({ onOpenPurchase }: { onOpenPurchase: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState(DEMO_INBOX[0].id)
  const [memoryState, setMemoryState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEMO_INBOX.map((item) => [item.id, item.memoryRecommended])),
  )
  const selected = DEMO_INBOX.find((item) => item.id === selectedId) ?? DEMO_INBOX[0]

  return (
    <div className="inbox-workspace">
      <aside className="inbox-list-panel">
        <header>
          <div><span className="eyebrow">商家 Agent 消息</span><h3>Inbox</h3></div>
          <span className="rail-count num">{DEMO_INBOX.length}</span>
        </header>
        <div className="inbox-filter-row">
          <span className="on">条件接收</span><span>3C / 日用</span><span>信用 ≥70</span>
        </div>
        <div className="inbox-message-list">
          {DEMO_INBOX.map((message) => (
            <button type="button" key={message.id} className={selected.id === message.id ? 'on' : ''} onClick={() => setSelectedId(message.id)}>
              <span className={`inbox-verdict-dot verdict-${message.verdict}`} />
              <span><strong>{message.title}</strong><small>{message.merchant} · {message.receivedAt}</small></span>
              <b className="num">{message.valueScore}</b>
            </button>
          ))}
        </div>
      </aside>

      <section className="inbox-detail scroll-y">
        <header className="inbox-detail-head">
          <div>
            <span className="eyebrow">{selected.category} · {selected.receivedAt}</span>
            <h3>{selected.title}</h3>
            <p>{selected.merchant}</p>
          </div>
          <span className={`verdict-badge verdict-${selected.verdict}`}>{selected.verdictLabel}</span>
        </header>

        <div className="merchant-offer-block">
          <span className="merchant-avatar"><Inbox size={18} /></span>
          <div><span>商家提案</span><strong>{selected.offer}</strong></div>
        </div>

        <div className="evidence-block">
          <span className="eyebrow">事实核验</span>
          {selected.evidence.map((item) => <div key={item}><Check size={13} />{item}</div>)}
        </div>

        <div className={`agent-evaluation verdict-${selected.verdict}`}>
          <header><Sparkles size={16} /><strong>Agent 评价</strong><span className="num">价值 {selected.valueScore}/100</span></header>
          <p>{selected.agentEvaluation}</p>
        </div>

        {selected.relatedPurchaseId && (
          <button className="open-related" type="button" onClick={() => onOpenPurchase(selected.relatedPurchaseId!)}>打开关联购买任务</button>
        )}
      </section>

      <aside className="memory-decision-panel">
        <div className="memory-orb"><Brain size={24} /></div>
        <span className="eyebrow">长期记忆决策</span>
        <h3>{memoryState[selected.id] ? '建议存入记忆' : '不存入记忆'}</h3>
        <p>{selected.memoryReason}</p>
        <div className="memory-actions">
          <button type="button" className={memoryState[selected.id] ? 'on' : ''} onClick={() => setMemoryState((state) => ({ ...state, [selected.id]: true }))}>
            <Brain size={15} />存入记忆
          </button>
          <button type="button" className={!memoryState[selected.id] ? 'on blocked' : ''} onClick={() => setMemoryState((state) => ({ ...state, [selected.id]: false }))}>
            <Archive size={15} />仅归档
          </button>
        </div>
        {selected.verdict === 'blocked' && <div className="sender-penalty"><ShieldBan size={15} />发送方已降权 30 天</div>}
        <div className="memory-boundary">只保存可验证事实与稳定偏好，不保存广告措辞。</div>
      </aside>
    </div>
  )
}
