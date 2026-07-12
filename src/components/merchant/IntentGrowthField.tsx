import {
  Bot,
  BrainCircuit,
  MessageSquareText,
  PackageCheck,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { StoredEvent } from '../live/types'
import { useIntentGrowth } from '../../hooks/useIntentGrowth'

interface DialoguePayload { buyerId: string; buyerName: string; context: string; round: number; role: 'buyer' | 'seller'; text: string }
interface LearningPayload { conversationGroups: number; dialogueRounds: number; observedSignals: number; generatedBy: 'llm' | 'fallback' }
interface IntentPayload { key: string; label: string; value: string; confidence: number; productField: string; evidence: string[]; generatedBy: 'llm' | 'fallback' }
interface FieldPayload { field: string; value: string; coverageAfter: number; evidence: string[] }
interface ProductPayload { productName: string; version: string; coverageBefore: number; coverageAfter: number; summary: string }
interface MatchPayload { buyerName: string; quantity: number; deadlineDays: number; requirements: string[]; scoreBefore: number; scoreAfter: number; rankBefore: number; rankAfter: number; scoreBreakdown: Record<string, number> }
interface TermsPayload { unitPriceUsd: number; quantity: number; deliveryDays: number; delayPenaltyPercent: number; totalUsd: number; messages: string[] }
interface OrderPayload { orderId: string; buyerName: string; quantity: number; totalUsd: number; deliveryDays: number; delayPenaltyPercent: number }
interface AttestationPayload { trustDelta: number; evidenceVerified: boolean; slaHonored: boolean; simulatedFulfillment: true }
interface RankPayload { rankBefore: number; rankAfter: number; scoreBefore: number; scoreAfter: number; shortlistRateBefore: number; shortlistRateAfter: number; ordersPerDayBefore: number; ordersPerDayAfter: number; projectedNewIntents: number }

const STAGES = [
  ['对话', 'intent-growth.market.ranked'],
  ['抽取', 'intent-growth.intent.extracted'],
  ['学习', 'intent-growth.gap.detected'],
  ['优化', 'intent-growth.product.version.published'],
  ['匹配', 'intent-growth.buyer.rematched'],
  ['成单', 'intent-growth.order.signed'],
  ['鉴证', 'intent-growth.attestation.issued'],
  ['升榜', 'intent-growth.rank.updated'],
] as const

const FALLBACK_DIALOGUES: DialoguePayload[] = [
  { buyerId: 'mia', buyerName: 'Mia Parent Agent', context: 'HOME + DAYCARE', round: 1, role: 'buyer', text: '家庭和托育中心共用，每天需要 60°C 消毒。' },
  { buyerId: 'daycare', buyerName: 'Little Steps Buyer Agent', context: '80 SETS · B2B', round: 2, role: 'buyer', text: '80 套，9 天交付，需要阶梯价和延期赔付。' },
  { buyerId: 'hotel', buyerName: 'Hotel Ops Buyer Agent', context: '24 ROOMS', round: 3, role: 'buyer', text: '需要经过 120 次商洗后的耐久报告。' },
]

const FIELD_FIXTURES = [
  { key: 'allergy', label: '低敏材料证据', field: 'evidence.allergen', value: 'OEKO-TEX · verified', existing: true },
  { key: 'use_context', label: '托育 / 共享使用', field: 'use_context', value: 'daycare · shared' },
  { key: 'wash_temp', label: '60°C 高频清洗', field: 'wash_temperature', value: '60°C · daily wash' },
  { key: 'wash_cycles', label: '120 次耐久证据', field: 'wash_cycles', value: '120 cycles · WASH-120' },
  { key: 'bulk_sla', label: '批发数量与 SLA', field: 'bulk_terms', value: '40-120 sets · 9d SLA' },
]

function payload<T>(events: StoredEvent[], type: string): T | undefined {
  return events.find((event) => event.type === type)?.payload as T | undefined
}
function payloads<T>(events: StoredEvent[], type: string): T[] {
  return events.filter((event) => event.type === type).map((event) => event.payload as T)
}
function stageIndex(events: StoredEvent[]) {
  let current = 1
  STAGES.forEach(([, type], index) => { if (events.some((event) => event.type === type)) current = index + 1 })
  return current
}

export function IntentGrowthField() {
  const runtime = useIntentGrowth()
  const dialogues = payloads<DialoguePayload>(runtime.events, 'intent-growth.dialogue.round')
  const learning = payload<LearningPayload>(runtime.events, 'intent-growth.learning.started')
  const intents = payloads<IntentPayload>(runtime.events, 'intent-growth.intent.extracted')
  const fields = payloads<FieldPayload>(runtime.events, 'intent-growth.product.field.updated')
  const product = payload<ProductPayload>(runtime.events, 'intent-growth.product.version.published')
  const match = payload<MatchPayload>(runtime.events, 'intent-growth.buyer.rematched')
  const terms = payload<TermsPayload>(runtime.events, 'intent-growth.terms.negotiated')
  const order = payload<OrderPayload>(runtime.events, 'intent-growth.order.signed')
  const attestation = payload<AttestationPayload>(runtime.events, 'intent-growth.attestation.issued')
  const rank = payload<RankPayload>(runtime.events, 'intent-growth.rank.updated')
  const running = runtime.phase === 'queued' || runtime.phase === 'running'
  const currentStage = stageIndex(runtime.events)
  const visibleDialogues = dialogues.length ? dialogues : FALLBACK_DIALOGUES
  const dialogueGroups = [...new Map(visibleDialogues.map((item) => [item.buyerId, item])).values()]

  return (
    <div className="intent-growth-field">
      <header className="intent-growth-head">
        <div>
          <span className="eyebrow">SELLER OS · INTENT LEARNING LOOP</span>
          <h3>商品能力从输掉的 Agent 交易中生长</h3>
          <p>落选对话成为训练信号，Product Output 更新后在下一次竞争中赢回来。</p>
        </div>
        <div className="intent-growth-actions">
          {runtime.transactionId && <span className="chain-state"><ShieldCheck size={13} />HASH CHAIN</span>}
          <button type="button" className="reset-active-sale" title="重置意图增长" onClick={runtime.reset}><RefreshCw size={15} /></button>
          <button type="button" className="run-active-sale" disabled={running} onClick={runtime.start}><Play size={14} />{running ? 'Intent Engine 运行中' : rank ? '重新训练' : '启动主动优化'}</button>
        </div>
      </header>

      <div className="intent-growth-metrics">
        <Metric label="对话轮次" value={learning?.dialogueRounds ?? dialogues.length} unit={learning ? 'LIVE + HISTORY' : 'WAITING'} />
        <Metric label="可用意图" value={intents.length} unit={learning?.generatedBy?.toUpperCase() ?? 'LLM READY'} />
        <Metric label="意图覆盖率" value={`${product?.coverageAfter ?? fields[fields.length - 1]?.coverageAfter ?? 61}%`} unit={product ? 'v2.2 LIVE' : 'v2.1'} />
        <Metric label="意图榜位" value={`#${rank?.rankAfter ?? match?.rankAfter ?? 3}`} unit={rank ? '+12 TRUST' : 'CURRENT'} success={Boolean(rank)} />
        <Metric label="订单金额" value={order ? `$${order.totalUsd.toLocaleString()}` : '$0'} unit={order ? 'SIGNED' : 'WAITING'} success={Boolean(order)} />
      </div>

      {runtime.error && <div className="active-sales-error">{runtime.error}</div>}

      <div className="intent-growth-workspace">
        <aside className="intent-dialogue-dock">
          <DockTitle icon={<MessageSquareText size={14} />} title="Buyer Agent Conversations" meta={`${dialogueGroups.length || 3} dialogue groups`} />
          <div className="intent-dialogue-stats">
            <span><b>{learning?.conversationGroups ?? dialogueGroups.length}</b>CONVERSATIONS</span>
            <span><b>{learning?.dialogueRounds ?? dialogues.length}</b>ROUNDS</span>
            <span><b>{learning?.observedSignals ?? 0}</b>{learning ? 'SIMULATED SIGNALS' : 'SIGNALS'}</span>
          </div>
          <div className="intent-dialogue-groups scroll-y">
            {dialogueGroups.map((group) => {
              const messages = dialogues.filter((item) => item.buyerId === group.buyerId)
              return <article key={group.buyerId} className={messages.length ? 'live' : ''}>
                <header><strong>{group.buyerName}</strong><span>{group.context}</span></header>
                <div>{(messages.length ? messages : [group]).map((message) => <p key={`${message.round}-${message.role}`} className={message.role}><b>{message.role === 'buyer' ? 'BUYER' : 'SELLER'}</b><span>{message.text}</span></p>)}</div>
                <footer>{messages.length ? `${messages.length} MESSAGES · ${intents.length ? 'INTENT EXTRACTED' : 'NEGOTIATING'}` : 'QUEUED'}</footer>
              </article>
            })}
          </div>
          <div className="intent-harvest">
            <header><strong>Usable Intent Output</strong><span>{intents.length} → ENGINE</span></header>
            {FIELD_FIXTURES.slice(1).map((fixture) => {
              const intent = intents.find((item) => item.key === fixture.key)
              return <div key={fixture.key} className={intent ? 'ready' : ''}><span>{fixture.field}</span><b>{intent ? `${intent.confidence}% READY` : 'FORMING'}</b></div>
            })}
          </div>
        </aside>

        <section className="intent-engine-field">
          <div className="growth-ring ring-evidence"><span>01 BUYER EVIDENCE</span></div>
          <div className="growth-ring ring-intents"><span>02 USABLE INTENTS</span></div>
          <div className="growth-ring ring-product"><span>03 PRODUCT OPTIMIZATION</span></div>
          <div className="growth-ring ring-market"><span>04 ORDER + REPUTATION</span></div>
          <div className={`growth-core ${product ? 'live' : learning ? 'learning' : ''}`}>
            <BrainCircuit size={27} />
            <strong>INTENT<br />LEARNING<br />ENGINE</strong>
            <span>{intents.length} ABSORBED</span>
          </div>
          {FIELD_FIXTURES.slice(1).map((fixture, index) => {
            const intent = intents.find((item) => item.key === fixture.key)
            const field = fields.find((item) => item.field === fixture.field)
            return <div key={fixture.key} className={`growth-branch branch-${index + 1} ${intent ? 'ready' : ''} ${field ? 'written' : ''}`}>
              <i /><span><b>{fixture.label}</b><small>{field?.value ?? intent?.value ?? 'WAITING'}</small></span>
            </div>
          })}
          <div className={`growth-buyer-node ${match ? 'matched' : ''}`}><Bot size={18} /><span><b>NEW BUYER INTENT</b><small>{match ? `${match.buyerName} · MATCH ${match.scoreAfter}` : 'WAITING FOR v2.2'}</small></span></div>
          <div className={`growth-order-node ${order ? 'signed' : terms ? 'negotiating' : ''}`}><PackageCheck size={18} /><span><b>{order ? `ORDER ${order.orderId}` : terms ? 'A2A NEGOTIATING' : 'ORDER PENDING'}</b><small>{order ? `${order.quantity} SETS · $${order.totalUsd.toLocaleString()}` : terms ? `$${terms.unitPriceUsd}/套 · ${terms.deliveryDays}D SLA` : 'NO EXECUTABLE TERMS'}</small></span></div>
          <div className={`growth-rank-node ${rank ? 'lifted' : ''}`}><TrendingUp size={18} /><span><b>INTENT RANK #{rank?.rankAfter ?? 3}</b><small>{rank ? `+${rank.projectedNewIntents} NEW INTENTS` : 'TRUST COMPOUNDING'}</small></span></div>
        </section>

        <aside className="intent-output-dock">
          <DockTitle icon={<Sparkles size={14} />} title="Optimization + Market" meta="intent writes product and reputation" />
          <div className="intent-product-summary">
            <span>PRODUCT OUTPUT <b>{product?.version ?? 'v2.1'}</b></span>
            <strong>{product?.productName ?? 'LumaCalm · 低敏床品'}</strong>
            <div><i style={{ width: `${product?.coverageAfter ?? fields[fields.length - 1]?.coverageAfter ?? 61}%` }} /><b>{product?.coverageAfter ?? fields[fields.length - 1]?.coverageAfter ?? 61}%</b></div>
          </div>
          <div className="intent-field-list scroll-y">
            {FIELD_FIXTURES.map((fixture) => {
              const intent = intents.find((item) => item.key === fixture.key)
              const field = fields.find((item) => item.field === fixture.field)
              const state = fixture.existing || field ? 'LIVE' : intent ? 'WRITING' : 'WAITING'
              return <article key={fixture.key} className={state.toLowerCase()}>
                <span><strong>{fixture.label}</strong><small>{fixture.field}</small></span><b>{state}</b>
                <p>{field?.value ?? (fixture.existing ? fixture.value : intent?.value ?? '等待真实买家信号')}</p>
              </article>
            })}
          </div>
          <div className="intent-order-card">
            <header><strong>Order + Reputation</strong><span>{match ? `MATCH ${match.scoreAfter}` : 'NO NEW MATCH'}</span></header>
            <div className={order ? 'signed' : terms ? 'negotiating' : ''}>
              <span>{order ? 'SIGNED' : terms ? 'NEGOTIATING' : 'WAITING'}</span><b>{order ? `$${order.totalUsd.toLocaleString()}` : '$0'}</b>
              <strong>{order?.buyerName ?? match?.buyerName ?? 'No authorized buyer selected'}</strong>
              <small>{attestation ? `REPCHAIN ATTESTED · +${attestation.trustDelta} TRUST` : 'RepChain attestation pending'}</small>
            </div>
            <footer>
              <span><small>Intent rank</small><b>#{rank?.rankAfter ?? 3}</b></span>
              <span><small>Shortlist</small><b>{rank?.shortlistRateAfter ?? 12}%</b></span>
              <span><small>Orders/day</small><b>{rank?.ordersPerDayAfter ?? 3}</b><em>SIMULATED</em></span>
            </footer>
          </div>
        </aside>
      </div>

      <footer className="intent-growth-stages">
        {STAGES.map(([label], index) => <div key={label} className={index + 1 < currentStage ? 'done' : index + 1 === currentStage ? 'active' : ''}><span>{String(index + 1).padStart(2, '0')}</span><b>{label}</b></div>)}
        <strong>{runtime.phase === 'completed' ? '闭环完成 · 每笔订单开始下一轮学习' : `${String(currentStage).padStart(2, '0')} / 08 · ${STAGES[currentStage - 1]?.[0]}`}</strong>
      </footer>
    </div>
  )
}

function DockTitle({ icon, title, meta }: { icon: ReactNode; title: string; meta: string }) {
  return <header className="intent-dock-title"><span>{icon}</span><div><strong>{title}</strong><small>{meta}</small></div></header>
}

function Metric({ label, value, unit, success = false }: { label: string; value: string | number; unit: string; success?: boolean }) {
  return <div className={success ? 'success' : ''}><span>{label}</span><strong className="num">{value}</strong><small>{unit}</small></div>
}
