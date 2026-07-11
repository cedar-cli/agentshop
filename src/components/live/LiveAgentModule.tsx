import {
  Activity,
  BadgeDollarSign,
  Bot,
  CheckCircle2,
  FileCheck2,
  HandCoins,
  PackageCheck,
  Play,
  Radio,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTransactionStream } from './useTransactionStream'
import type {
  AuthorizedOrderPayload,
  ConfirmedOrderPayload,
  CounterOfferPayload,
  CounterResponsePayload,
  EvidenceSubmissionPayload,
  GeneratedBy,
  NewbornScenario,
  ProposalPayload,
  ReceiptPayload,
  RuntimeInfo,
  SellerScorePayload,
  SellerSelectionPayload,
  StoredEvent,
} from './types'
import './live.css'

type LiveView = 'purchase' | 'evidence'

const PURCHASE_EVENTS = [
  'purchase.requested',
  'proposal.submitted',
  'seller.selected',
  'counter.offer',
  'counter.response',
  'order.confirmed',
] as const

const EVIDENCE_EVENTS = [
  'intent.published',
  'seller.matched',
  'evidence.requested',
  'evidence.submitted',
  'seller.score.updated',
  'order.authorized',
  'receipt.issued',
] as const

const SELLER_NAMES: Record<string, string> = {
  'seller-a': 'Seller A · 低价策略',
  'seller-b': 'Seller B · 信用策略',
  'seller-c': 'Seller C · 时效策略',
}

function payload<T>(event: StoredEvent | undefined): T | undefined {
  return event?.payload as T | undefined
}

function latestEvent(events: StoredEvent[], type: string, sellerId?: string) {
  return [...events]
    .reverse()
    .find(
      (event) =>
        event.type === type &&
        (sellerId === undefined || event.payload.sellerId === sellerId),
    )
}

function SourceBadge({ source }: { source: GeneratedBy }) {
  return (
    <span className={`live-source live-source-${source}`}>
      {source === 'llm' ? <Sparkles size={11} /> : <ShieldCheck size={11} />}
      {source === 'llm' ? 'GPT-5.6 LUNA · LIVE' : 'RULE FALLBACK'}
    </span>
  )
}

function LiveButton({
  busy,
  done,
  onStart,
}: {
  busy: boolean
  done: boolean
  onStart: () => void
}) {
  return (
    <button className="live-run" type="button" disabled={busy} onClick={onStart}>
      {busy ? <Activity size={15} className="live-spin" /> : done ? <RefreshCcw size={15} /> : <Play size={15} />}
      {busy ? 'Agent 网络运行中' : done ? '重新运行' : '启动实时交易'}
    </button>
  )
}

export function LiveAgentModule({ embedded = false }: { embedded?: boolean }) {
  const [view, setView] = useState<LiveView>('purchase')
  const [runtime, setRuntime] = useState<RuntimeInfo>()
  const [scenario, setScenario] = useState<NewbornScenario>()

  useEffect(() => {
    void fetch('/api/runtime')
      .then((response) => (response.ok ? response.json() : undefined))
      .then((value: RuntimeInfo | undefined) => setRuntime(value))
      .catch(() => setRuntime(undefined))

    void fetch('/api/demo/newborn-bedding')
      .then((response) => (response.ok ? response.json() : undefined))
      .then((value: NewbornScenario | undefined) => setScenario(value))
      .catch(() => setScenario(undefined))
  }, [])

  return (
    <div className={embedded ? 'live-module live-module-embedded' : 'module live-module'}>
      <header className="live-head">
        <div className="live-title-wrap">
          <span className="live-agent-mark"><Bot size={18} /></span>
          <div>
            <h2 className="module-title">实时 Agent 交易</h2>
            <p className="module-desc">真实 Router、OpenAI 模型、SSE 事件与哈希链共同驱动，不使用前端伪事件。</p>
          </div>
        </div>
        <div className="live-runtime panel-inset">
          <span className={runtime?.llmConfigured ? 'online' : 'offline'}><Radio size={13} /> API</span>
          <strong>{runtime?.model ?? '连接中'}</strong>
          <span>{runtime?.evidenceLlmEnabled ? 'Evidence LLM ON' : 'Safe fallback ready'}</span>
        </div>
      </header>

      <nav className="live-tabs" aria-label="实时 Agent 工作台">
        <button type="button" className={view === 'purchase' ? 'on' : ''} onClick={() => setView('purchase')}>
          <BadgeDollarSign size={16} />智能报价与砍价
        </button>
        <button type="button" className={view === 'evidence' ? 'on' : ''} onClick={() => setView('evidence')}>
          <FileCheck2 size={16} />证据询证与自动购买
        </button>
      </nav>

      <div className={embedded ? 'live-stage' : 'live-stage panel'}>
        {view === 'purchase' ? <PurchasePanel /> : <EvidencePanel scenario={scenario} />}
      </div>
    </div>
  )
}

function PurchasePanel() {
  const demo = useTransactionStream(PURCHASE_EVENTS, 'order.confirmed')
  const proposals = demo.events
    .filter((event) => event.type === 'proposal.submitted')
    .map((event) => payload<ProposalPayload>(event)!)
  const selection = payload<SellerSelectionPayload>(latestEvent(demo.events, 'seller.selected'))
  const counterOffer = payload<CounterOfferPayload>(latestEvent(demo.events, 'counter.offer'))
  const counterResponse = payload<CounterResponsePayload>(latestEvent(demo.events, 'counter.response'))
  const order = payload<ConfirmedOrderPayload>(latestEvent(demo.events, 'order.confirmed'))
  const busy = demo.phase === 'queued' || demo.phase === 'running'

  const start = () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    demo.start({
      endpoint: '/api/transactions',
      body: {
        product: '低敏婴儿床品套装',
        quantity: 3,
        budget: 150,
        deadline,
        constraints: { allergenFree: ['甲醛', '荧光增白剂'] },
        weights: { price: 0.3, reputation: 0.5, delivery: 0.2 },
      },
    })
  }

  return (
    <div className="live-grid live-purchase-grid">
      <section className="live-column live-intent-column">
        <div className="live-section-title"><span className="eyebrow">BUYER INTENT</span><h3>机器采购意图</h3></div>
        <div className="live-intent-card panel-inset">
          <strong>低敏婴儿床品套装 × 3</strong>
          <dl>
            <div><dt>预算上限</dt><dd>$150</dd></div>
            <div><dt>决策权重</dt><dd>信用 50%</dd></div>
            <div><dt>硬约束</dt><dd>甲醛 / 荧光剂零容忍</dd></div>
            <div><dt>执行方式</dt><dd>自动选标并砍价</dd></div>
          </dl>
        </div>
        <LiveButton busy={busy} done={demo.phase === 'completed'} onStart={start} />
        <div className="live-tx"><span>TX</span><code>{demo.transactionId ?? '尚未创建'}</code></div>
        {demo.error && <p className="live-error">{demo.error}</p>}
      </section>

      <section className="live-column live-market-column">
        <div className="live-section-title"><span className="eyebrow">SELLER PROPOSALS</span><h3>三个 Seller Agent 实时报价</h3></div>
        <div className="live-proposals">
          {proposals.length === 0 && <EmptyState text="发布需求后，三个商家 Agent 将同时调用模型生成报价。" />}
          {proposals.map((proposal) => (
            <article key={proposal.sellerId} className={`live-proposal ${selection?.sellerId === proposal.sellerId ? 'winner' : ''}`}>
              <header><strong>{SELLER_NAMES[proposal.sellerId] ?? proposal.sellerId}</strong><SourceBadge source={proposal.generatedBy} /></header>
              <div className="live-metrics">
                <span><b>${proposal.totalPrice.toFixed(2)}</b>报价</span>
                <span><b>{proposal.deliveryHours}h</b>交付</span>
                <span><b>{proposal.reputation}</b>信用</span>
              </div>
              <p>{proposal.reasoning}</p>
              {selection?.sellerId === proposal.sellerId && <em><CheckCircle2 size={12} />综合得分 {selection.score}</em>}
            </article>
          ))}
        </div>
      </section>

      <section className="live-column live-decision-column">
        <div className="live-section-title"><span className="eyebrow">NEGOTIATION</span><h3>买卖 Agent 单轮砍价</h3></div>
        {!counterOffer && <EmptyState text="买家完成全量比较后，自动向赢家发起还价。" />}
        {counterOffer && (
          <div className="live-dialogue">
            <div className="buyer"><span>C-Agent</span><p>{counterOffer.reasoning}</p><b>${counterOffer.originalPrice.toFixed(2)} → ${counterOffer.targetPrice.toFixed(2)}</b></div>
            {counterResponse && (
              <div className="seller"><span>S-Agent · {counterResponse.sellerId}</span><SourceBadge source={counterResponse.generatedBy} /><p>{counterResponse.reasoning}</p><b>最终成交 ${counterResponse.finalPrice.toFixed(2)} · 让利 ${counterResponse.concession.toFixed(2)}</b></div>
            )}
          </div>
        )}
        {order && (
          <div className="live-order">
            <PackageCheck size={22} />
            <div><span>Agent Order Confirmed</span><strong>${order.totalPrice.toFixed(2)}</strong><code>{order.orderId}</code></div>
          </div>
        )}
        <EventStrip events={demo.events} chainValid={demo.chainValid} />
      </section>
    </div>
  )
}

function EvidencePanel({ scenario }: { scenario: NewbornScenario | undefined }) {
  const demo = useTransactionStream(EVIDENCE_EVENTS, 'receipt.issued')
  const busy = demo.phase === 'queued' || demo.phase === 'running'
  const sellerCSubmission = payload<EvidenceSubmissionPayload>(latestEvent(demo.events, 'evidence.submitted', 'seller-c'))
  const authorization = payload<AuthorizedOrderPayload>(latestEvent(demo.events, 'order.authorized'))
  const receipt = payload<ReceiptPayload>(latestEvent(demo.events, 'receipt.issued'))

  const scores = useMemo(() => {
    const map = new Map<string, SellerScorePayload>()
    for (const event of demo.events) {
      if (event.type === 'seller.score.updated') {
        const score = payload<SellerScorePayload>(event)
        if (score) map.set(score.sellerId, score)
      }
    }
    return [...map.values()].sort((a, b) => a.rank - b.rank)
  }, [demo.events])

  const act = receipt ? 4 : sellerCSubmission ? 3 : demo.events.some((event) => event.type === 'seller.matched') ? 2 : demo.events.some((event) => event.type === 'intent.published') ? 1 : 0

  return (
    <div className="live-evidence-layout">
      <div className="live-actbar">
        {['发布意图', '卖家匹配', '机器询证', '自动购买'].map((label, index) => (
          <span key={label} className={act >= index + 1 ? 'on' : ''}><b>{index + 1}</b>{label}</span>
        ))}
      </div>

      <div className="live-grid live-evidence-grid">
        <section className="live-column live-intent-column">
          <div className="live-section-title"><span className="eyebrow">EXECUTABLE INTENT</span><h3>低敏床品意图</h3></div>
          <div className="live-intent-card panel-inset">
            <strong>{scenario?.intent.productDescription ?? '场景加载中'}</strong>
            <dl>
              <div><dt>预算</dt><dd>${scenario?.intent.budgetUsd ?? 180}</dd></div>
              <div><dt>时限</dt><dd>{scenario?.intent.deadlineHours ?? 72} 小时</dd></div>
              <div><dt>风险阈值</dt><dd>&lt; {scenario?.intent.riskThreshold ?? 0.15}</dd></div>
              <div><dt>授权</dt><dd>满足证据后自动购买</dd></div>
            </dl>
            <ul>{scenario?.intent.unacceptable.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <LiveButton busy={busy} done={demo.phase === 'completed'} onStart={() => demo.start({ endpoint: '/api/demo/newborn-bedding' })} />
          <div className="live-tx"><span>TX</span><code>{demo.transactionId ?? '尚未创建'}</code></div>
        </section>

        <section className="live-column live-market-column">
          <div className="live-section-title"><span className="eyebrow">DECISION RANKING</span><h3>证据驱动排名</h3></div>
          <div className="live-ranking">
            {scores.length === 0 && <EmptyState text="意图广播后，三家卖家将提交证据并重新排名。" />}
            {scores.map((score) => (
              <article key={score.sellerId} className={score.rank === 1 ? 'winner' : score.stage === 'rejected' ? 'rejected' : ''}>
                <b>#{score.rank}</b>
                <div><strong>{scenario?.sellers.find((seller) => seller.sellerId === score.sellerId)?.displayName ?? score.sellerId}</strong><span>{score.stage}</span></div>
                <dl><span>Match {score.matchScore}</span><span>Trust {score.trustScore}</span><span>Delivery {score.deliveryConfidence}</span><span>Total {score.totalScore}</span></dl>
              </article>
            ))}
          </div>
        </section>

        <section className="live-column live-decision-column">
          <div className="live-section-title"><span className="eyebrow">SELLER C EVIDENCE</span><h3>真实模型询证回答</h3></div>
          {!sellerCSubmission && <EmptyState text="Seller C 收到问题后，将使用模型在可验证事实边界内作答。" />}
          {sellerCSubmission && (
            <div className="live-evidence-answers">
              <header><strong>Seller C 回答来源</strong><SourceBadge source={sellerCSubmission.generatedBy} /></header>
              {Object.entries(sellerCSubmission.answers).map(([question, answer]) => (
                <div key={question}><span>{question.replace(/^q-/, '').replaceAll('-', ' ')}</span><p>{answer}</p></div>
              ))}
            </div>
          )}
          {authorization && receipt && (
            <div className="live-receipt">
              <HandCoins size={21} />
              <div><span>Buyer Agent authorized purchase</span><strong>${receipt.amountUsd}</strong><small>{receipt.deliveryHours}h delivery · auto-approved</small></div>
              <CheckCircle2 size={18} />
            </div>
          )}
          <EventStrip events={demo.events} chainValid={demo.chainValid} />
        </section>
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="live-empty"><Bot size={20} /><span>{text}</span></div>
}

function EventStrip({ events, chainValid }: { events: StoredEvent[]; chainValid: boolean | undefined }) {
  return (
    <div className="live-event-strip">
      <span><Radio size={11} />{events.length} events</span>
      <code>{events.length ? events[events.length - 1]?.type : 'Router waiting'}</code>
      {chainValid !== undefined && <b className={chainValid ? 'valid' : 'invalid'}>{chainValid ? 'Hash Chain Verified' : 'Chain Invalid'}</b>}
    </div>
  )
}
