import {
  BadgeCheck,
  Bot,
  CirclePlay,
  LockKeyhole,
  PackageSearch,
  RefreshCw,
  Route,
  ShieldCheck,
  ShieldX,
  Sparkles,
} from 'lucide-react'
import type { StoredEvent } from '../live/types'
import { useActiveSales } from '../../hooks/useActiveSales'

interface PassportPayload {
  features: string[]
  summary: string
  passport: { material: string; evidence: string; delivery: string; returns: string }
  coverageAfter: number
  generatedBy: 'llm' | 'fallback'
  fallbackReason?: string
}

interface BuyerPayload {
  buyerId: string
  displayName: string
  profile: string
  consent: 'open' | 'limited' | 'closed'
  exposedFields: string[]
  matchScore: number
  reasons: string[]
}

interface ProposalPayload {
  buyerId: string
  pitch: string
  matchScore: number
  generatedBy: 'llm' | 'fallback'
}

interface SelectionPayload {
  buyerId: string
  score: number
  reason: string
  comparison: Array<{ product: string; priceUsd: number; evidence: string; delivery: string; score: number }>
}

interface CompletedPayload {
  orderId: string
  amountUsd: number
  humanClicks: 0
  productName: string
  displayName: string
}

const STEPS = [
  ['01', '商品进入 Seller Agent'],
  ['02', '提取可验证特征'],
  ['03', '发布商品通行证'],
  ['04', '匹配授权买家画像'],
  ['05', '通过 Consent Router'],
  ['06', 'Buyer Agent 自动比较'],
  ['07', '授权范围内自动购买'],
] as const

function eventPayload<T>(events: StoredEvent[], type: string): T | undefined {
  return events.find((event) => event.type === type)?.payload as T | undefined
}

function eventPayloads<T>(events: StoredEvent[], type: string): T[] {
  return events.filter((event) => event.type === type).map((event) => event.payload as T)
}

function currentStep(events: StoredEvent[]) {
  if (events.some((event) => event.type === 'active-sale.completed')) return 7
  if (events.some((event) => event.type === 'active-sale.buyer.selected')) return 6
  if (events.some((event) => event.type === 'active-sale.proposal.routed' || event.type === 'active-sale.proposal.blocked')) return 5
  if (events.some((event) => event.type === 'active-sale.buyer.matched')) return 4
  if (events.some((event) => event.type === 'active-sale.passport.published')) return 3
  if (events.some((event) => event.type === 'active-sale.product.ingested')) return 2
  return 1
}

export function ActiveSalesRouter() {
  const runtime = useActiveSales()
  const step = currentStep(runtime.events)
  const passport = eventPayload<PassportPayload>(runtime.events, 'active-sale.passport.published')
  const buyers = eventPayloads<BuyerPayload>(runtime.events, 'active-sale.buyer.matched')
  const proposals = eventPayloads<ProposalPayload>(runtime.events, 'active-sale.proposal.routed')
  const selection = eventPayload<SelectionPayload>(runtime.events, 'active-sale.buyer.selected')
  const completed = eventPayload<CompletedPayload>(runtime.events, 'active-sale.completed')
  const running = runtime.phase === 'queued' || runtime.phase === 'running'

  return (
    <div className="active-sales-router">
      <aside className="active-sales-story">
        <div className="active-sales-brand">
          <span><Route size={16} /></span>
          <div><strong>Active Sales Router</strong><small>Consent-based selling</small></div>
        </div>
        <ol>
          {STEPS.map(([index, label], itemIndex) => {
            const itemStep = itemIndex + 1
            return <li key={index} className={itemStep === step ? 'active' : itemStep < step ? 'done' : ''}><b>{index}</b><span>{label}</span><i /></li>
          })}
        </ol>
        <div className="active-sales-progress"><span><b>{step}</b> / 7</span><i><b style={{ width: `${step / 7 * 100}%` }} /></i></div>
      </aside>

      <section className="active-sales-main">
        <header className="active-sales-head">
          <div><span className="eyebrow">SELLER AGENT · LIVE ROUTING</span><h3>商品主动找到合适的买家</h3><p>个性化提案仅进入买家明确授权的 Inbox。</p></div>
          <div className="active-sales-actions">
            {runtime.transactionId && <span className="chain-state"><ShieldCheck size={13} />{runtime.chainValid === false ? 'CHAIN ERROR' : 'HASH CHAIN'}</span>}
            <button type="button" className="reset-active-sale" onClick={runtime.reset} title="重置主动销售"><RefreshCw size={15} /></button>
            <button type="button" className="run-active-sale" disabled={running} onClick={runtime.start}><CirclePlay size={15} />{running ? 'Seller Agent 运行中' : completed ? '再次运行' : '启动 Seller Agent'}</button>
          </div>
        </header>

        <div className="active-sales-metrics">
          <Metric label="在售商品" value="24" unit="SKUs" />
          <Metric label="通行证覆盖" value={passport ? `${passport.coverageAfter}%` : '58%'} unit="fields" />
          <Metric label="授权收件箱" value={buyers.length ? String(buyers.filter((buyer) => buyer.consent !== 'closed').length) : '0'} unit="matched" />
          <Metric label="已送达提案" value={String(proposals.length)} unit="live" />
          <Metric label="自动成交" value={completed ? '1' : '0'} unit={completed ? `$${completed.amountUsd}` : '$0'} success />
        </div>

        {runtime.error && <div className="active-sales-error">{runtime.error}</div>}

        <div className="active-sales-grid">
          <section className="sales-pane product-shelf">
            <PaneTitle title="Product Shelf" subtitle="merchant catalog" badge="24 ONLINE" />
            <article className="active-product selected">
              <span className="product-glyph"><PackageSearch size={23} /><small>NB-401</small></span>
              <div><strong>Newborn CalmSleep Kit</strong><span>$164 · Stock 1,200</span><small>Machine-ready product · 39% margin</small></div>
            </article>
            <article className="active-product muted"><span className="product-code">DC</span><div><strong>Daycare Bulk Sleep Pack</strong><span>$112/set · Stock 840</span></div></article>
            <article className="active-product muted"><span className="product-code">HT</span><div><strong>Allergy-Safe Hotel Kit</strong><span>$236 · Stock 320</span></div></article>
            <div className="seller-watch"><Bot size={14} /><span><b>Seller Agent watch</b>商品、库存或价格变化后自动重建可售 Output。</span></div>
          </section>

          <section className="sales-pane seller-workbench">
            <PaneTitle title="Seller Agent Workbench" subtitle="understand → package" badge={passport ? 'OUTPUT v2.1' : running ? 'EXTRACTING' : 'WAITING'} />
            <div className="workbench-product"><span>NB-401</span><div><strong>Newborn CalmSleep Kit</strong><small>{passport?.summary ?? '商品页仍以人类营销文案为主，等待 Agent 提取可验证字段。'}</small></div><b>{passport ? '92%' : '58%'}</b></div>
            <div className="agent-pipeline">
              <PipelineNode active={step >= 2} icon={<Sparkles size={13} />} label="特征提取" />
              <PipelineNode active={step >= 3} icon={<BadgeCheck size={13} />} label="通行证" />
              <PipelineNode active={step >= 4} icon={<Route size={13} />} label="画像匹配" />
            </div>
            <div className={`passport-panel ${passport ? 'ready' : ''}`}>
              <header><div><strong>商品通行证</strong><small>{passport ? `PUBLISHED · ${passport.generatedBy.toUpperCase()}` : 'DRAFT v2.0'}</small></div><span>{passport ? '58% → 92%' : 'WAITING'}</span></header>
              <div className="feature-list">
                {(passport?.features ?? ['材料待结构化', '证据待绑定', 'SLA 待量化', '退货待机器化']).map((feature) => <span key={feature}>{feature}</span>)}
              </div>
              {passport && <dl><div><dt>材料</dt><dd>{passport.passport.material}</dd></div><div><dt>证据</dt><dd>{passport.passport.evidence}</dd></div><div><dt>配送</dt><dd>{passport.passport.delivery}</dd></div><div><dt>退货</dt><dd>{passport.passport.returns}</dd></div></dl>}
            </div>
          </section>

          <section className="sales-pane buyer-router">
            <PaneTitle title="Authorized Buyer Inboxes" subtitle="profile match + consent" badge={buyers.length ? `${proposals.length} ROUTED · ${buyers.filter((b) => b.consent === 'closed').length} BLOCKED` : 'NO ROUTES'} />
            <div className="buyer-lanes">
              {buyers.length === 0 ? <EmptyBuyerLanes /> : buyers.map((buyer) => {
                const proposal = proposals.find((item) => item.buyerId === buyer.buyerId)
                return <BuyerLane key={buyer.buyerId} buyer={buyer} proposal={proposal} />
              })}
            </div>
            <div className={`buyer-decision ${selection ? 'ready' : ''}`}>
              <header><strong>Mia's Buyer Agent · Auto Compare</strong><span>{selection ? 'RANKED' : 'WAITING'}</span></header>
              {(selection?.comparison ?? [
                { product: 'CalmSleep Kit v2.1', priceUsd: 164, evidence: '—', delivery: '—', score: 0 },
                { product: 'CloudCotton Baby Set', priceUsd: 149, evidence: '—', delivery: '—', score: 0 },
              ]).map((item, index) => <div key={item.product} className={index === 0 && selection ? 'winner' : ''}><strong>{item.product}</strong><span>${item.priceUsd}</span><span>{item.evidence}</span><span>{item.delivery}</span><b>{item.score}</b></div>)}
              {completed && <div className="machine-receipt"><BadgeCheck size={17} /><span><small>MACHINE RECEIPT · PURCHASED</small><strong>{completed.productName} · ${completed.amountUsd}</strong><em>{completed.displayName} authorized · Human clicks 0</em></span></div>}
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}

function PaneTitle({ title, subtitle, badge }: { title: string; subtitle: string; badge: string }) {
  return <header className="sales-pane-title"><div><strong>{title}</strong><span>{subtitle}</span></div><b>{badge}</b></header>
}

function Metric({ label, value, unit, success = false }: { label: string; value: string; unit: string; success?: boolean }) {
  return <div className={success ? 'success' : ''}><span>{label}</span><strong className="num">{value}</strong><small>{unit}</small></div>
}

function PipelineNode({ active, icon, label }: { active: boolean; icon: React.ReactNode; label: string }) {
  return <div className={active ? 'active' : ''}><span>{icon}</span><b>{label}</b></div>
}

function BuyerLane({ buyer, proposal }: { buyer: BuyerPayload; proposal?: ProposalPayload }) {
  const blocked = buyer.consent === 'closed'
  return <article className={`buyer-lane ${buyer.consent}`}>
    <div className="buyer-lane-head"><span><Bot size={14} /></span><div><strong>{buyer.displayName}</strong><small>{buyer.profile}</small></div><b>{buyer.matchScore || 'BLOCK'}</b></div>
    <div className="consent-row"><span className={buyer.consent}>{buyer.consent.toUpperCase()}</span><small>{blocked ? '禁止主动提案 · 0 字段暴露' : `${buyer.exposedFields.length} 个授权字段`}</small></div>
    {blocked
      ? <div className="blocked-proposal"><ShieldX size={16} /><span><b>PERMISSION DENIED</b><small>Seller Agent 无法读取画像或写入 Inbox</small></span></div>
      : <div className={`routed-proposal ${proposal ? 'ready' : ''}`}><Route size={15} /><span><b>{proposal ? `PROPOSAL · ${proposal.generatedBy.toUpperCase()}` : 'MATCHED · WAITING ROUTE'}</b><small>{proposal?.pitch ?? buyer.reasons.join(' · ')}</small></span></div>}
  </article>
}

function EmptyBuyerLanes() {
  return <div className="empty-buyer-lanes"><LockKeyhole size={22} /><strong>等待 Consent Router</strong><span>没有授权前，Seller Agent 看不到任何买家画像。</span></div>
}
