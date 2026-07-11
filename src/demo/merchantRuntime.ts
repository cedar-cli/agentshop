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
    title: transaction.kind === 'active-sales-demo' ? '授权主动销售' : '实时 Agent 采购',
    product: transaction.product,
    category: transaction.category,
    scene: 'passive',
    sceneLabel: '实时跨端交易',
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
