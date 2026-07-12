import type { StoredEvent } from '../components/live/types'
import type { MerchantTransactionDto } from '../hooks/useMerchantTransactions'
import { adaptLaptopPurchase } from './laptopRuntime'
import { adaptRestockPurchase } from './restockRuntime'
import { getPurchaseById, type DemoEvent, type DemoPurchase } from './demoData'

const time = (timestamp: string) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp))
const record = <T,>(event: StoredEvent) => event.payload as T

function genericEvent(event: StoredEvent): DemoEvent {
  const common = { id: event.id, time: time(event.timestamp), origin: 'rule' as const }
  switch (event.type) {
    case 'active-sale.product.ingested':
      return { ...common, kind: 'agent', actor: 'Seller Agent', title: '商品进入主动销售 Router', body: `${record<{ name: string; sourceCoverage: number }>(event).name}，原始字段覆盖 ${record<{ sourceCoverage: number }>(event).sourceCoverage}%。` }
    case 'active-sale.passport.published': {
      const value = record<{ coverageAfter: number; generatedBy: 'llm' | 'fallback'; summary: string }>(event)
      return { ...common, kind: 'evidence', actor: 'Seller Agent', title: 'Product Passport 发布', body: value.summary, evidence: `字段覆盖 ${value.coverageAfter}%`, origin: value.generatedBy === 'llm' ? 'llm' : 'rule' }
    }
    case 'active-sale.buyer.matched': {
      const value = record<{ displayName: string; consent: string; matchScore: number }>(event)
      return { ...common, kind: 'comparison', actor: 'Consent Router', title: `匹配 ${value.displayName}`, body: `${value.consent.toUpperCase()} 授权 · 匹配分 ${value.matchScore}` }
    }
    case 'active-sale.proposal.routed': {
      const value = record<{ displayName: string; pitch: string; generatedBy: 'llm' | 'fallback' }>(event)
      return { ...common, kind: 'seller-message', actor: 'Seller Agent', title: `提案进入 ${value.displayName} Inbox`, body: value.pitch, origin: value.generatedBy === 'llm' ? 'llm' : 'rule' }
    }
    case 'active-sale.proposal.blocked':
      return { ...common, kind: 'evidence', actor: 'Consent Router', title: 'Closed Inbox 拦截提案', body: record<{ reason: string }>(event).reason, impact: '0 字段暴露' }
    case 'active-sale.buyer.selected': {
      const value = record<{ displayName: string; score: number; reason: string }>(event)
      return { ...common, kind: 'comparison', actor: `${value.displayName} Buyer Agent`, title: 'Consumer Agent 自动选择', body: value.reason, impact: `综合分 ${value.score}` }
    }
    case 'active-sale.completed': {
      const value = record<{ amountUsd: number; humanClicks: number }>(event)
      return { ...common, kind: 'payment', actor: 'Buyer Agent', title: '授权范围内自动成交', body: `成交 $${value.amountUsd}，人类点击 ${value.humanClicks} 次。` }
    }
    case 'intent-growth.market.ranked': {
      const value = record<{ title: string; currentRank: number; currentScore: number }>(event)
      return { ...common, kind: 'comparison', actor: 'Intent Market Router', title: '首次意图排行榜生成', body: `${value.title} · 当前排名 #${value.currentRank}`, impact: `匹配分 ${value.currentScore}` }
    }
    case 'intent-growth.seller.shortlisted':
      return { ...common, kind: 'comparison', actor: 'Buyer Agent', title: '进入前三沟通名单', body: record<{ reason: string }>(event).reason }
    case 'intent-growth.dialogue.round': {
      const value = record<{ buyerName: string; role: 'buyer' | 'seller'; text: string }>(event)
      return { ...common, kind: 'seller-message', actor: value.role === 'buyer' ? value.buyerName : 'LumaCalm Seller Agent', title: value.role === 'buyer' ? '买家提出采购约束' : '商家回应能力边界', body: value.text }
    }
    case 'intent-growth.seller.lost':
      return { ...common, kind: 'evidence', actor: 'Buyer Agent', title: '首次竞标落选', body: record<{ reason: string }>(event).reason, impact: '触发失败复盘' }
    case 'intent-growth.learning.started': {
      const value = record<{ dialogueRounds: number; observedSignals: number; generatedBy: 'llm' | 'fallback' }>(event)
      return { ...common, kind: 'agent', actor: 'Intent Learning Engine', title: '吸收落选对话', body: `${value.dialogueRounds} 轮对话进入学习引擎；历史信号规模 ${value.observedSignals}（模拟）。`, origin: value.generatedBy === 'llm' ? 'llm' : 'rule' }
    }
    case 'intent-growth.intent.extracted': {
      const value = record<{ label: string; value: string; confidence: number; generatedBy: 'llm' | 'fallback' }>(event)
      return { ...common, kind: 'evidence', actor: 'Intent Learning Engine', title: `Intent READY · ${value.label}`, body: value.value, impact: `置信度 ${value.confidence}%`, origin: value.generatedBy === 'llm' ? 'llm' : 'rule' }
    }
    case 'intent-growth.gap.detected':
      return { ...common, kind: 'comparison', actor: 'Intent Learning Engine', title: '识别商品能力缺口', body: record<{ summary: string }>(event).summary }
    case 'intent-growth.product.field.updated': {
      const value = record<{ field: string; value: string; coverageAfter: number }>(event)
      return { ...common, kind: 'agent', actor: 'Product Agent', title: `写入 ${value.field}`, body: value.value, impact: `Coverage ${value.coverageAfter}%` }
    }
    case 'intent-growth.product.version.published': {
      const value = record<{ productName: string; previousVersion: string; version: string; coverageAfter: number }>(event)
      return { ...common, kind: 'evidence', actor: 'Product Agent', title: `Product Output ${value.previousVersion} → ${value.version}`, body: value.productName, impact: `Coverage ${value.coverageAfter}%` }
    }
    case 'intent-growth.buyer.rematched': {
      const value = record<{ buyerName: string; scoreBefore: number; scoreAfter: number; rankBefore: number; rankAfter: number }>(event)
      return { ...common, kind: 'comparison', actor: `${value.buyerName} Buyer Agent`, title: '新版商品重新匹配', body: `新增字段全部满足采购约束，匹配分 ${value.scoreBefore} → ${value.scoreAfter}。`, impact: `#${value.rankBefore} → #${value.rankAfter}` }
    }
    case 'intent-growth.quote.requested':
      return { ...common, kind: 'negotiation', actor: 'Little Steps Buyer Agent', title: '请求机器可执行报价', body: '80 套 · 9 天 SLA · 阶梯价 · 延期赔付' }
    case 'intent-growth.terms.negotiated': {
      const value = record<{ unitPriceUsd: number; quantity: number; deliveryDays: number; delayPenaltyPercent: number; totalUsd: number }>(event)
      return { ...common, kind: 'negotiation', actor: 'Buyer Agent ↔ Seller Agent', title: 'A2A 条款达成', body: `$${value.unitPriceUsd}/套 · ${value.quantity} 套 · ${value.deliveryDays} 天交付 · 延期 ${value.delayPenaltyPercent}% 赔付`, impact: `$${value.totalUsd.toLocaleString()}` }
    }
    case 'intent-growth.order.signed': {
      const value = record<{ orderId: string; totalUsd: number }>(event)
      return { ...common, kind: 'payment', actor: 'Contract Agent', title: '机器可执行订单签署', body: `${value.orderId} · $${value.totalUsd.toLocaleString()}` }
    }
    case 'intent-growth.attestation.issued': {
      const value = record<{ trustDelta: number }>(event)
      return { ...common, kind: 'attestation', actor: 'RepChain', title: '模拟履约鉴证完成', body: '9 天交付、商品证据、SLA 与售后规则全部通过。', impact: `TRUST +${value.trustDelta}`, origin: 'simulation' }
    }
    case 'intent-growth.rank.updated': {
      const value = record<{ rankBefore: number; rankAfter: number; ordersPerDayAfter: number; projectedNewIntents: number }>(event)
      return { ...common, kind: 'memory', actor: 'Intent Market Router', title: '信用回流推动升榜', body: `Intent Rank #${value.rankBefore} → #${value.rankAfter}；规模指标为模拟预测。`, impact: `${value.ordersPerDayAfter} orders/day · +${value.projectedNewIntents} intents` }
    }
    default:
      return { ...common, kind: 'agent', actor: event.source, title: event.type, body: JSON.stringify(event.payload) }
  }
}

export function adaptMerchantTransaction(transaction: MerchantTransactionDto): DemoPurchase {
  if (transaction.kind === 'laptop-demo') {
    const base = getPurchaseById('laptop-trip')!
    return adaptLaptopPurchase({ ...base, id: transaction.id, buyerName: transaction.buyerName }, transaction.events)
  }
  if (transaction.kind === 'household-restock-demo') {
    const base = getPurchaseById('paper-restock')!
    return adaptRestockPurchase({ ...base, id: transaction.id, buyerName: transaction.buyerName }, transaction.events)
  }

  const amount = transaction.amount ?? 0
  const budget = transaction.budget ?? amount
  const score = Math.round(transaction.score ?? 90)
  const completed = transaction.status === 'completed'
  return {
    id: transaction.id,
    title: transaction.kind === 'active-sales-demo' ? '授权主动销售' : transaction.kind === 'intent-growth-demo' ? '意图训练后赢单' : '实时 Agent 采购',
    product: transaction.product,
    category: transaction.category,
    scene: 'passive',
    sceneLabel: transaction.kind === 'intent-growth-demo' ? '商家主动优化' : '实时跨端交易',
    mode: 'autonomous',
    status: completed ? 'completed' : transaction.status === 'awaiting-approval' ? 'awaiting' : 'negotiating',
    statusLabel: transaction.statusLabel,
    buyerName: transaction.buyerName,
    merchantName: transaction.winner ?? 'Seller Agent Network',
    mechanism: transaction.mechanism,
    date: '刚刚',
    budget,
    paid: amount,
    saved: Math.max(0, budget - amount),
    trustScore: score,
    authorization: '后端 transaction 授权边界',
    trigger: '共享 Router 实时事件',
    constraints: transaction.constraints,
    result: completed ? '消费者端与商家端共享同一 transaction，事件链已完成。' : '交易正在共享 Router 中执行。',
    memory: '交易结果由消费者 Agent 决定是否写入长期记忆。',
    offers: [{
      seller: transaction.winner ?? 'Seller Agent Network', price: amount || budget,
      originalPrice: budget, credit: score, match: score, eta: '按合约履约',
      promise: transaction.chainValid ? 'Hash Chain verified' : '等待链验证', selected: true,
      reason: transaction.mechanism,
      metrics: { timeliness: score, spec: score, afterSales: score, price: Math.max(60, score - 8) },
    }],
    baselinePref: { timeliness: 25, spec: 30, price: 20, afterSales: 25 },
    events: transaction.events.map(genericEvent),
  }
}
