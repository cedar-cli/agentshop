import {
  BadgeCheck,
  Bot,
  Boxes,
  Building2,
  CircleDollarSign,
  Factory,
  Flame,
  Network,
  PackageSearch,
  Play,
  RefreshCw,
  Route,
  ScanText,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { StoredEvent } from '../live/types'
import { useDemandNetwork } from '../../hooks/useDemandNetwork'

interface NeedPayload { needId: string; buyerType: string; text: string; source: 'demo-fixture' | 'consumer-transaction' }
interface IntentPayload { needId: string; scene: string; quantity: number; budgetUsd: number; deadlineDays: number; requirements: string[]; generatedBy: 'llm' | 'fallback' }
interface MarketPayload { sampleSize: number; simulatedMarketIntents: number; clusters: Array<{ label: string; sampleHits: number; simulatedDemand: number; growthPercent: number }> }
interface ForecastPayload { selectedProduct: string; candidates: Array<{ product: string; marketHeat: number; supplyFit: number; marginFit: number; totalScore: number }>; reason: string }
interface SupplyPayload { quantity: number; unitPriceUsd: number; depositPercent: number; deliveryDays: number; delayPenaltyPercentPerDay: number; reasoning: string; generatedBy: 'llm' | 'fallback' }
interface BatchPayload { batchId: string; quantity: number; checks: string[]; productPassportId: string }
interface ContractPayload { contractId: string; commissionRate: number; maxDiscountPercent: number; minimumMarginPercent: number }
interface DistributorPayload { agentId: string; label: string; channel: string; authorizedIntentCount: number; matchScore: number }
interface OrdersPayload { orderCount: number; gmvUsd: number; b2cOrders: number; b2bOrders: number; attestedOrders: number; sampleOrders: Array<{ source: string; buyer: string; amountUsd: number }> }
interface CommissionPayload { amountUsd: number; commissionRate: number; orderCount: number }

const STAGE_TYPES = [
  'demand.need.received', 'demand.intent.structured', 'demand.market.aggregated',
  'demand.product.forecasted', 'demand.supply.negotiated', 'demand.batch.completed',
  'distribution.contract.published', 'distribution.agent.matched', 'distribution.commission.released',
] as const

function payload<T>(events: StoredEvent[], type: string): T | undefined {
  return events.find((event) => event.type === type)?.payload as T | undefined
}

function payloads<T>(events: StoredEvent[], type: string): T[] {
  return events.filter((event) => event.type === type).map((event) => event.payload as T)
}

function reached(events: StoredEvent[], stage: number) {
  return events.some((event) => event.type === STAGE_TYPES[stage - 1])
}

function activeStage(events: StoredEvent[]) {
  let value = 1
  STAGE_TYPES.forEach((type, index) => { if (events.some((event) => event.type === type)) value = index + 1 })
  return value
}

export function DemandNetwork() {
  const runtime = useDemandNetwork()
  const [commissionRate, setCommissionRate] = useState(3)
  const [maxDiscount, setMaxDiscount] = useState(8)
  const needs = payloads<NeedPayload>(runtime.events, 'demand.need.received')
  const intents = payloads<IntentPayload>(runtime.events, 'demand.intent.structured')
  const market = payload<MarketPayload>(runtime.events, 'demand.market.aggregated')
  const forecast = payload<ForecastPayload>(runtime.events, 'demand.product.forecasted')
  const supply = payload<SupplyPayload>(runtime.events, 'demand.supply.negotiated')
  const batch = payload<BatchPayload>(runtime.events, 'demand.batch.completed')
  const contract = payload<ContractPayload>(runtime.events, 'distribution.contract.published')
  const distributors = payloads<DistributorPayload>(runtime.events, 'distribution.agent.matched')
  const orders = payload<OrdersPayload>(runtime.events, 'distribution.orders.completed')
  const commission = payload<CommissionPayload>(runtime.events, 'distribution.commission.released')
  const running = runtime.phase === 'queued' || runtime.phase === 'running'
  const stage = activeStage(runtime.events)

  return (
    <div className="demand-network">
      <header className="demand-network-head">
        <div><span className="eyebrow">DEMAND-TO-DISTRIBUTION · LIVE ROUTER</span><h3>需求驱动的供给网络</h3><p>买家表达目标，市场自动组织选品、产能与分销。</p></div>
        <div className="demand-network-actions">
          {runtime.transactionId && <span className="chain-state"><ShieldCheck size={13} />HASH CHAIN</span>}
          <button type="button" className="reset-active-sale" title="重置需求网络" onClick={runtime.reset}><RefreshCw size={15} /></button>
          <button type="button" className="run-active-sale" disabled={running} onClick={() => runtime.start(commissionRate, maxDiscount)}><Play size={14} />{running ? 'Agent 网络运行中' : commission ? '再次运行' : '启动需求网络'}</button>
        </div>
      </header>

      <div className="demand-market-strip">
        <MarketMetric label="活跃买家 Agent" value="18,642" unit="SIMULATED" />
        <MarketMetric label="原始需求" value="128,460" unit="24H SNAPSHOT" />
        <MarketMetric label="结构化意图" value={market ? market.simulatedMarketIntents.toLocaleString() : String(intents.length)} unit={market ? 'SIMULATED' : 'LIVE SAMPLE'} />
        <MarketMetric label="分销触达" value={distributors.length ? '1,428' : '0'} unit={distributors.length ? 'SIMULATED' : 'AGENTS'} />
        <MarketMetric label="订单 / GMV" value={orders ? String(orders.orderCount) : '0'} unit={orders ? `$${orders.gmvUsd.toLocaleString()}` : '$0'} success />
        <div className="market-stage-counter"><span>场景</span><strong className="num">{String(stage).padStart(2, '0')} / 09</strong></div>
      </div>

      {runtime.error && <div className="active-sales-error">{runtime.error}</div>}

      <div className="demand-flow-grid">
        <FlowStage number={1} title="买家需求流" subtitle="N buyers / live input" icon={<Bot size={15} />} active={stage === 1} done={reached(runtime.events, 1)}>
          <div className="need-stream">
            {(needs.length ? needs : [
              { needId: 'A17', buyerType: 'consumer', text: '新生儿低敏床品 · ≤$180 · 72h', source: 'demo-fixture' as const },
              { needId: 'B04', buyerType: 'business', text: '幼儿园批采 120 套 · 10 天', source: 'demo-fixture' as const },
              { needId: 'H09', buyerType: 'business', text: '酒店低敏客房 · 20 rooms', source: 'demo-fixture' as const },
            ]).slice(0, 3).map((need) => <div key={need.needId}><b>{need.needId}</b><span>{need.text}</span>{need.source === 'consumer-transaction' && <em>LIVE C-AGENT</em>}</div>)}
          </div>
        </FlowStage>

        <FlowStage number={2} title="Intent Extractor" subtitle="goal / constraint / context" icon={<ScanText size={15} />} active={stage === 2} done={reached(runtime.events, 2)}>
          <div className="intent-mini-list">
            {(intents.length ? intents.slice(0, 3) : [{ needId: '—', scene: '等待自然语言需求', quantity: 0, budgetUsd: 0, deadlineDays: 0, requirements: [], generatedBy: 'fallback' as const }]).map((intent) => <div key={intent.needId}><span><b>{intent.scene}</b><small>{intent.quantity || '—'} 件 · {intent.deadlineDays || '—'} 天 · ${intent.budgetUsd || '—'}</small></span><em className={intent.generatedBy}>{intent.generatedBy.toUpperCase()}</em></div>)}
          </div>
        </FlowStage>

        <FlowStage number={3} title="全网意图热力" subtitle="DEMO MARKET SNAPSHOT" icon={<Flame size={15} />} active={stage === 3} done={reached(runtime.events, 3)} simulated>
          <div className="demand-heatmap">
            {(market?.clusters ?? [
              { label: '低敏 / 新生儿', sampleHits: 0, simulatedDemand: 0, growthPercent: 0 },
              { label: '机构批采', sampleHits: 0, simulatedDemand: 0, growthPercent: 0 },
              { label: '可验证材料', sampleHits: 0, simulatedDemand: 0, growthPercent: 0 },
              { label: '72h–10d 交付', sampleHits: 0, simulatedDemand: 0, growthPercent: 0 },
            ]).map((cluster, index) => <div key={cluster.label} className={market ? `heat-${4 - index}` : ''}><strong>{cluster.label}</strong><span>{market ? `${cluster.simulatedDemand.toLocaleString()} · +${cluster.growthPercent}%` : 'WAITING'}</span></div>)}
          </div>
        </FlowStage>

        <FlowStage number={4} title="选品与供给预测" subtitle="demand × supply × margin" icon={<PackageSearch size={15} />} active={stage === 4} done={reached(runtime.events, 4)}>
          <div className="forecast-mini-list">
            {(forecast?.candidates ?? []).map((candidate, index) => <div key={candidate.product} className={index === 0 ? 'selected' : ''}><span><b>{candidate.product}</b><small>热力 {candidate.marketHeat} · 供给 {candidate.supplyFit} · 毛利 {candidate.marginFit}</small></span><strong>{candidate.totalScore}</strong></div>)}
            {!forecast && <EmptyLine text="等待 Intent 热力形成" />}
          </div>
        </FlowStage>

        <FlowStage number={5} title="A2A 供应协商" subtitle="Seller ↔ Supply Agent" icon={<Building2 size={15} />} active={stage === 5} done={reached(runtime.events, 5)}>
          {supply ? <div className="supply-contract"><div><span>1,200 套</span><b>${supply.unitPriceUsd}/套</b></div><div><span>{supply.deliveryDays} 天</span><b>{supply.depositPercent}% 定金</b></div><p>{supply.reasoning}</p><em className={supply.generatedBy}>{supply.generatedBy.toUpperCase()}</em></div> : <EmptyLine text="等待 Seller Agent 发起供应询价" />}
        </FlowStage>

        <FlowStage number={6} title="工厂履约" subtitle="manufacturing batch" icon={<Factory size={15} />} active={stage === 6} done={reached(runtime.events, 6)} simulated>
          {batch ? <div className="batch-status"><header><strong>Batch #{batch.batchId}</strong><b>RELEASED</b></header><div>{batch.checks.map((check) => <span key={check}><BadgeCheck size={11} />{check}</span>)}</div><small>{batch.quantity.toLocaleString()} units · {batch.productPassportId}</small></div> : <EmptyLine text="SIMULATED FACTORY · WAITING" />}
        </FlowStage>

        <FlowStage number={7} title="分销合约" subtitle="commission + guardrails" icon={<CircleDollarSign size={15} />} active={stage === 7} done={reached(runtime.events, 7)}>
          <div className="distribution-controls">
            <Slider label="成交佣金" value={commissionRate} min={1} max={8} step={.5} suffix="%" disabled={running} onChange={setCommissionRate} />
            <Slider label="最大议价空间" value={maxDiscount} min={2} max={15} step={1} suffix="%" disabled={running} onChange={setMaxDiscount} />
            <div><span>最低毛利</span><b>{contract?.minimumMarginPercent ?? 24}%</b><span>结算</span><b>履约 + 鉴证</b></div>
          </div>
        </FlowStage>

        <FlowStage number={8} title="分销 Agent 网络" subtitle="authorized intent matching" icon={<Network size={15} />} active={stage === 8} done={reached(runtime.events, 8)} simulated>
          <div className="distributor-network">
            <span className="network-output"><Route size={14} />OUTPUT</span>
            {(distributors.length ? distributors : [
              { agentId: 'care', label: 'CARE', channel: '', authorizedIntentCount: 0, matchScore: 0 },
              { agentId: 'bulk', label: 'BULK', channel: '', authorizedIntentCount: 0, matchScore: 0 },
              { agentId: 'mom', label: 'MOM', channel: '', authorizedIntentCount: 0, matchScore: 0 },
              { agentId: 'hotel', label: 'HOTEL', channel: '', authorizedIntentCount: 0, matchScore: 0 },
              { agentId: 'price', label: 'PRICE', channel: '', authorizedIntentCount: 0, matchScore: 0 },
              { agentId: 'daycare', label: 'DAYCARE', channel: '', authorizedIntentCount: 0, matchScore: 0 },
            ]).map((agent) => <span key={agent.agentId} className={distributors.length ? 'matched' : ''}><b>{agent.label}</b><small>{agent.authorizedIntentCount || '—'} intents</small></span>)}
          </div>
        </FlowStage>

        <FlowStage number={9} title="规模成交与分账" subtitle="orders / GMV / commission" icon={<ShoppingBag size={15} />} active={stage === 9} done={reached(runtime.events, 9)} simulated>
          {orders ? <div className="distribution-results"><div><span><small>ORDERS</small><b>{orders.orderCount}</b></span><span><small>GMV</small><b>${orders.gmvUsd.toLocaleString()}</b></span><span><small>COMMISSION</small><b>${commission?.amountUsd.toLocaleString() ?? 'WAIT'}</b></span></div><ul>{orders.sampleOrders.slice(0, 3).map((order) => <li key={order.source}><b>{order.source}</b><span>{order.buyer}</span><strong>${order.amountUsd.toLocaleString()}</strong></li>)}</ul></div> : <EmptyLine text="等待分销网络完成履约与鉴证" />}
        </FlowStage>
      </div>
    </div>
  )
}

function FlowStage({ number, title, subtitle, icon, active, done, simulated = false, children }: { number: number; title: string; subtitle: string; icon: ReactNode; active: boolean; done: boolean; simulated?: boolean; children: ReactNode }) {
  return <article className={`demand-stage ${active ? 'active' : ''} ${done ? 'done' : ''}`}><header><span>{icon}</span><div><strong>{String(number).padStart(2, '0')} · {title}</strong><small>{subtitle}</small></div>{simulated && <em>SIMULATED</em>}</header><section>{children}</section></article>
}

function MarketMetric({ label, value, unit, success = false }: { label: string; value: string; unit: string; success?: boolean }) {
  return <div className={success ? 'success' : ''}><span>{label}</span><strong className="num">{value}</strong><small>{unit}</small></div>
}

function Slider({ label, value, min, max, step, suffix, disabled, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; disabled: boolean; onChange: (value: number) => void }) {
  return <label><span>{label}</span><b>{value.toFixed(step < 1 ? 1 : 0)}{suffix}</b><input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

function EmptyLine({ text }: { text: string }) {
  return <div className="demand-empty"><Boxes size={17} /><span>{text}</span></div>
}
