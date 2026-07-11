import { Archive, Brain, Check, Inbox, Radio, ShieldBan, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { InboxRuntime } from '../../hooks/useInbox'

type InboxFilter = 'all' | 'approval' | 'completed' | 'blocked'

export function ConsumerInbox({
  onOpenPurchase,
  inbox,
}: {
  onOpenPurchase: (id: string) => void
  inbox: InboxRuntime
}) {
  const [selectedId, setSelectedId] = useState(inbox.messages[0]?.id ?? '')
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [actionError, setActionError] = useState<string>()
  const selected = inbox.messages.find((item) => item.id === selectedId) ?? inbox.messages[0]

  useEffect(() => {
    if (!selectedId && inbox.messages[0]) setSelectedId(inbox.messages[0].id)
    if (selectedId && !inbox.messages.some((item) => item.id === selectedId) && inbox.messages[0]) {
      setSelectedId(inbox.messages[0].id)
    }
  }, [inbox.messages, selectedId])

  const counts = useMemo(() => ({
    approval: inbox.messages.filter((message) => message.type === 'approval').length,
    completed: inbox.messages.filter((message) => message.type === 'completed').length,
    blocked: inbox.messages.filter((message) => message.type === 'blocked').length,
  }), [inbox.messages])
  const visible = filter === 'all' ? inbox.messages : inbox.messages.filter((message) => message.type === filter)

  const decideMemory = async (recommended: boolean) => {
    if (!selected) return
    setActionError(undefined)
    try {
      if (recommended) await inbox.setMemory(selected.id, true)
      else {
        await inbox.setMemory(selected.id, false)
        await inbox.archive(selected.id)
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  if (!selected) return <div className="inbox-empty"><Inbox size={20} />Inbox 暂无消息</div>

  return (
    <div className="inbox-workspace">
      <aside className="inbox-list-panel">
        <header>
          <div><span className="eyebrow">Agent 注意力队列</span><h3>Inbox</h3></div>
          <span className="rail-count num">{inbox.messages.length}</span>
        </header>
        <div className="inbox-api-state">
          <Radio size={11} /><span className={inbox.apiOnline ? 'online' : 'offline'}>{inbox.apiOnline ? 'LIVE API' : 'FIXTURE FALLBACK'}</span>
        </div>
        <div className="inbox-filter-row">
          <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>全部 {inbox.messages.length}</button>
          <button type="button" className={filter === 'approval' ? 'on' : ''} onClick={() => setFilter('approval')}>待决策 {counts.approval}</button>
          <button type="button" className={filter === 'completed' ? 'on' : ''} onClick={() => setFilter('completed')}>自动完成 {counts.completed}</button>
          <button type="button" className={filter === 'blocked' ? 'on' : ''} onClick={() => setFilter('blocked')}>已拦截 {counts.blocked}</button>
        </div>
        <div className="inbox-message-list">
          {visible.map((message) => (
            <button type="button" key={message.id} className={selected.id === message.id ? 'on' : ''} onClick={() => setSelectedId(message.id)}>
              <span className={`inbox-verdict-dot verdict-${message.verdict}`} />
              <span><strong>{message.title}</strong><small>{message.merchant} · {formatReceivedAt(message.receivedAt)}</small></span>
              <b className="num">{message.valueScore}</b>
            </button>
          ))}
        </div>
      </aside>

      <section className="inbox-detail scroll-y">
        <header className="inbox-detail-head">
          <div>
            <span className="eyebrow">{selected.category} · {formatReceivedAt(selected.receivedAt)}</span>
            <h3>{selected.title}</h3>
            <p>{selected.merchant}</p>
          </div>
          <span className={`verdict-badge verdict-${selected.verdict}`}>{selected.verdictLabel}</span>
        </header>

        <div className="inbox-source-row">
          <span className={selected.runtime === 'live' ? 'live' : 'fixture'}>{selected.runtime === 'live' ? 'LIVE EVENT' : 'FIXTURE'}</span>
          <span>{selected.source === 'active-service' ? '主动服务' : selected.source === 'seller-agent' ? 'Seller Agent' : '系统'}</span>
          <span>{selected.generatedBy === 'llm' ? 'LLM 解释' : '规则判定'}</span>
          {selected.chainValid && <b>Hash Chain verified</b>}
        </div>

        <div className="merchant-offer-block">
          <span className="merchant-avatar"><Inbox size={18} /></span>
          <div><span>{selected.type === 'completed' ? '执行结果' : '商家提案'}</span><strong>{selected.offer}</strong></div>
        </div>

        <div className="evidence-block">
          <span className="eyebrow">事实核验</span>
          {selected.evidence.map((item) => <div key={item}><Check size={13} />{item}</div>)}
        </div>

        <div className={`agent-evaluation verdict-${selected.verdict}`}>
          <header><Sparkles size={16} /><strong>Agent 评价</strong><span className="num">价值 {selected.valueScore}/100</span></header>
          <p>{selected.agentEvaluation}</p>
        </div>

        {selected.type === 'completed' && <div className="inbox-no-action"><Check size={13} />已自动处理，无需人工操作</div>}
        {selected.relatedPurchaseId && (
          <button className="open-related" type="button" onClick={() => onOpenPurchase(selected.relatedPurchaseId!)}>
            {selected.type === 'completed' ? '查看真实交易链' : '打开关联购买任务'}
          </button>
        )}
        {(actionError || inbox.error) && <div className="runtime-error">{actionError ?? inbox.error}</div>}
      </section>

      <aside className="memory-decision-panel">
        <div className="memory-orb"><Brain size={24} /></div>
        <span className="eyebrow">长期记忆决策</span>
        <h3>{selected.memoryRecommended ? '建议存入记忆' : '不存入记忆'}</h3>
        <p>{selected.memoryReason}</p>
        <div className="memory-actions">
          <button type="button" className={selected.memoryRecommended ? 'on' : ''} onClick={() => void decideMemory(true)}>
            <Brain size={15} />存入记忆
          </button>
          <button type="button" className={!selected.memoryRecommended ? 'on blocked' : ''} onClick={() => void decideMemory(false)}>
            <Archive size={15} />仅归档
          </button>
        </div>
        {selected.senderPenaltyDays && <div className="sender-penalty"><ShieldBan size={15} />发送方已降权 {selected.senderPenaltyDays} 天</div>}
        <div className="memory-boundary">只保存可验证事实与稳定偏好，不保存广告措辞。</div>
      </aside>
    </div>
  )
}

function formatReceivedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}
