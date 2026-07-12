import type { StoredEvent } from '../components/live/types'
import type { DemoEvent, DemoOffer, DemoPurchase } from './demoData'

interface RestockProposalPayload {
  sellerId: string
  displayName: string
  totalPriceCny: number
  deliveryHours: number
  reputation: number
  reasoning: string
  generatedBy: 'llm' | 'fallback'
}
const payload = <T,>(event: StoredEvent | undefined) => event?.payload as T | undefined
const latest = (events: StoredEvent[], type: string) => [...events].reverse().find((event) => event.type === type)
const origin = (source?: 'llm' | 'fallback'): DemoEvent['origin'] => source === 'llm' ? 'llm' : 'rule'
const time = (timestamp: string) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp))

export function restockMonitoringPurchase(base: DemoPurchase): DemoPurchase {
  return {
    ...base,
    status: 'monitoring',
    statusLabel: '持续监测',
    date: '预计 4 天后触发',
    paid: 0,
    saved: 0,
    result: 'Agent 正在监测库存和消耗速度，尚未产生采购指令。',
    events: [{
      id: 'restock-monitoring', kind: 'agent', actor: '库存预测 Agent', time: '持续监测',
      title: '家庭库存持续监测', body: '厨房纸剩余 18%，预计 4 天后进入补库阈值；当前无需执行采购。',
      evidence: '模拟库存传感器 · 预测置信度 93%', origin: 'simulation',
    }],
  }
}

export function adaptRestockPurchase(base: DemoPurchase, events: StoredEvent[]): DemoPurchase {
  if (events.length === 0) return restockMonitoringPurchase(base)
  const selected = payload<{ sellerId: string; displayName: string; score: number }>(latest(events, 'restock.seller.selected'))
  const bundle = payload<{ finalPriceCny: number; concessionCny: number }>(latest(events, 'restock.bundle.negotiated'))
  const order = payload<{ totalPriceCny: number }>(latest(events, 'restock.order.confirmed'))
  const complete = events.some((event) => event.type === 'restock.notification.sent')
  const proposals = events.filter((event) => event.type === 'restock.proposal.submitted').map((event) => payload<RestockProposalPayload>(event)).filter((item): item is RestockProposalPayload => Boolean(item))
  const paid = order?.totalPriceCny ?? bundle?.finalPriceCny ?? 0
  const offers: DemoOffer[] = proposals.map((proposal) => {
    const chosen = proposal.sellerId === selected?.sellerId
    return {
      seller: proposal.displayName,
      price: chosen && paid ? paid : proposal.totalPriceCny,
      originalPrice: proposal.totalPriceCny,
      credit: proposal.reputation,
      match: chosen ? Math.round(selected?.score ?? 0) : Math.round(proposal.reputation * 0.8),
      eta: proposal.deliveryHours <= 24 ? '次日达' : `${Math.ceil(proposal.deliveryHours / 24)} 天`,
      promise: chosen ? '免运费 + 组合折扣' : '规格匹配',
      selected: chosen,
      reason: proposal.reasoning,
      metrics: chosen
        ? { timeliness: 92, spec: 96, afterSales: 88, price: 78 }
        : { timeliness: Math.max(55, 100 - proposal.deliveryHours / 2), spec: 82, afterSales: proposal.reputation, price: 84 },
    }
  })
  return {
    ...base,
    status: complete ? 'completed' : 'negotiating',
    statusLabel: complete ? '自动完成' : '自主采购中',
    date: complete ? '刚刚' : '进行中',
    paid,
    saved: paid ? Math.max(0, base.budget - paid) : 0,
    trustScore: selected ? Math.round(selected.score) : base.trustScore,
    merchantName: selected?.displayName ?? base.merchantName,
    result: complete ? '在长期授权范围内自动完成比价、组合议价和下单；人类交互 0 次。' : '库存预测已经触发，Agent 正在授权范围内自主执行。',
    offers: offers.length ? offers : base.offers,
    events: events.map(adaptRestockEvent),
  }
}

function adaptRestockEvent(event: StoredEvent): DemoEvent {
  const common = { id: event.id, time: time(event.timestamp) }
  switch (event.type) {
    case 'restock.time.advanced': {
      const value = payload<{ days: number; beforePercent: number; afterPercent: number }>(event)!
      return { ...common, kind: 'agent', actor: 'Demo 世界时钟', title: `推进 ${value.days} 天到库存触发点`, body: `厨房纸库存从 ${value.beforePercent}% 降至 ${value.afterPercent}%。这只是演示时间推进，不是购买指令。`, origin: 'simulation' }
    }
    case 'restock.inventory.forecasted': {
      const value = payload<{ item: string; remainingPercent: number; hoursUntilEmpty: number; confidence: number }>(event)!
      return { ...common, kind: 'agent', actor: '库存预测 Agent', title: '库存预测自动触发', body: `${value.item}剩余 ${value.remainingPercent}%，预计 ${value.hoursUntilEmpty} 小时后耗尽。`, evidence: `模拟传感器 · 置信度 ${value.confidence}%`, origin: 'simulation' }
    }
    case 'restock.authorization.checked': {
      const value = payload<{ singlePurchaseLimitCny: number; monthlyRemainingCny: number; daysSinceLastPurchase: number }>(event)!
      return { ...common, kind: 'approval', actor: 'C-Agent', title: '长期授权校验通过', body: `单次上限 ¥${value.singlePurchaseLimitCny}，月度剩余额度 ¥${value.monthlyRemainingCny}，距上次采购 ${value.daysSinceLastPurchase} 天。`, impact: '无需人工确认', origin: 'rule' }
    }
    case 'restock.intent.created': {
      const value = payload<{ product: string; reason: string }>(event)!
      return { ...common, kind: 'agent', actor: 'C-Agent', title: '自动生成采购意图', body: `${value.product}。${value.reason}`, origin: 'rule' }
    }
    case 'restock.proposal.submitted': {
      const value = payload<RestockProposalPayload>(event)!
      return { ...common, kind: 'seller-message', actor: `${value.displayName} S-Agent`, title: '提交补库报价', body: `${value.reasoning} 报价 ¥${value.totalPriceCny.toFixed(0)}，${Math.ceil(value.deliveryHours / 24)} 天内送达。`, origin: origin(value.generatedBy) }
    }
    case 'restock.seller.selected': {
      const value = payload<{ displayName: string; score: number; reason: string }>(event)!
      return { ...common, kind: 'comparison', actor: 'C-Agent', title: '自动比较并选标', body: `${value.displayName}综合得分 ${value.score}。${value.reason}`, evidence: '单位价格、信用和时效由确定性规则计算。', origin: 'rule' }
    }
    case 'restock.bundle.negotiated': {
      const value = payload<{ originalPriceCny: number; finalPriceCny: number; concessionCny: number; reasoning: string; generatedBy: 'llm' | 'fallback' }>(event)!
      return { ...common, kind: 'negotiation', actor: 'C-Agent ↔ S-Agent', title: '组合采购议价', body: value.reasoning, impact: `¥${value.originalPriceCny.toFixed(0)} → ¥${value.finalPriceCny.toFixed(0)} · 让利 ¥${value.concessionCny.toFixed(0)}`, origin: origin(value.generatedBy) }
    }
    case 'restock.order.authorized': {
      const value = payload<{ amountCny: number; checks: string[]; humanInteractions: number }>(event)!
      return { ...common, kind: 'approval', actor: 'C-Agent', title: '授权内自动购买', body: value.checks.join('；'), impact: `¥${value.amountCny.toFixed(0)} · 人类交互 ${value.humanInteractions} 次`, origin: 'rule' }
    }
    case 'restock.order.confirmed': {
      const value = payload<{ displayName: string; totalPriceCny: number }>(event)!
      return { ...common, kind: 'payment', actor: 'Buyer Agent', title: 'Agent Order 自动创建', body: `已向${value.displayName}下单，成交 ¥${value.totalPriceCny.toFixed(0)}，没有等待人工确认。`, origin: 'rule' }
    }
    case 'restock.inventory.updated':
      return { ...common, kind: 'fulfilment', actor: 'Demo 家庭库存', title: '模拟验收入库', body: '厨房纸 24 卷、无香型洗手液 2 瓶已写入家庭库存。', evidence: 'Demo 模拟数据，不代表真实外部物流。', origin: 'simulation' }
    case 'restock.memory.updated': {
      const value = payload<{ memory: string }>(event)!
      return { ...common, kind: 'memory', actor: 'C-Agent', title: '更新消耗记忆', body: value.memory, origin: 'rule' }
    }
    default: {
      const value = payload<{ summary: string }>(event)!
      return { ...common, kind: 'attestation', actor: 'C-Agent Inbox', title: '完成后通知人类', body: value.summary, impact: '无需操作', origin: 'rule' }
    }
  }
}
