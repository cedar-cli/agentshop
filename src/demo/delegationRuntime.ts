import type { DemoPurchase, DemoScene } from './demoData'
import { adaptLaptopPurchase } from './laptopRuntime'
import type { DelegationMode, DelegationSession } from '../hooks/useConsumerDelegations'

export interface DelegationModeMeta {
  mode: DelegationMode
  label: string
  scene: DemoScene
  sceneLabel: string
  authorization: string
  hint: string
}

// 五种主动服务方式的展示口径。auto 为默认全权代买；其余对应四类主动服务场景。
export const DELEGATION_MODES: DelegationModeMeta[] = [
  { mode: 'auto', label: '全权代买', scene: 'passive', sceneLabel: '全权委托', authorization: '授权内自动完成', hint: '直接说明完整购物意图，Agent 自动比较、议价、下单与鉴证。' },
  { mode: 'restock', label: '日用品补库', scene: 'restock', sceneLabel: '日用品补库', authorization: '月度授权内代买', hint: '周期性日用品，Agent 按消耗与授权自动补库。' },
  { mode: 'scarce', label: '稀缺品抢购', scene: 'scarce', sceneLabel: '稀缺品抢购', authorization: '稀缺资源全权代买', hint: '稀缺资源，Agent 在授权上限内自动锁定并成交。' },
  { mode: 'lowprice', label: '高值蹲低价', scene: 'lowprice', sceneLabel: '高值蹲低价', authorization: '授权阈值内自动成交', hint: '高值商品，Agent 蹲到可信低价即在授权阈值内成交。' },
  { mode: 'secondhand', label: '盯二手商品', scene: 'secondhand', sceneLabel: '盯二手商品', authorization: '验机通过后放款', hint: '二手寻源，Agent 比较成色并在托管验机后完成交易。' },
]

export const getDelegationMode = (mode: DelegationMode): DelegationModeMeta =>
  DELEGATION_MODES.find((item) => item.mode === mode) ?? DELEGATION_MODES[0]

function shortTitle(requestText: string): string {
  const trimmed = requestText.trim().replace(/\s+/g, ' ')
  return trimmed.length > 16 ? `${trimmed.slice(0, 16)}…` : trimmed
}

/**
 * 把一次委托会话（真实 LLM 事件流）适配为 DemoPurchase，复用轻薄本适配器的
 * KPI/报价/事件映射，再按主动服务方式与「全自动、无需确认」的语义覆写状态口径。
 */
export function adaptDelegation(session: DelegationSession): DemoPurchase {
  const meta = getDelegationMode(session.mode)
  const base: DemoPurchase = {
    id: session.localId,
    title: shortTitle(session.requestText) || '新增委托任务',
    product: '解析中…',
    category: '委托任务',
    scene: meta.scene,
    sceneLabel: meta.sceneLabel,
    mode: 'autonomous',
    status: 'negotiating',
    statusLabel: 'Agent 自动执行中',
    buyerName: '买家·你',
    merchantName: 'Agent 采购网络',
    mechanism: '真实 LLM 委托代买',
    date: '刚刚',
    budget: 0,
    paid: 0,
    saved: 0,
    trustScore: 90,
    authorization: meta.authorization,
    trigger: session.requestText,
    constraints: [],
    result: '消费 Agent 已全自动接管本次委托。',
    memory: '委托完成后自动沉淀本次偏好与成交价，用于未来同类判断。',
    offers: [],
    baselinePref: { timeliness: 30, spec: 30, price: 25, afterSales: 15 },
    events: [],
  }

  const adapted = adaptLaptopPurchase(base, session.events)
  const completed = session.phase === 'completed'
  const failed = session.phase === 'failed'
  const queued = session.phase === 'queued'

  return {
    ...adapted,
    // 委托任务全程自动，覆写轻薄本适配器里「待你确认」等人工语义。
    status: completed ? 'completed' : failed ? 'awaiting' : 'negotiating',
    statusLabel: completed
      ? '自动完成'
      : failed
        ? '执行失败'
        : queued
          ? '排队中'
          : 'Agent 自动执行中',
    date: completed ? '刚刚' : '进行中',
    result: completed
      ? '消费 Agent 已在授权内全自动完成比较、议价、下单与链上鉴证。'
      : failed
        ? '本次委托执行失败，已保留可审计事件链。'
        : 'Agent 正在向市场自动采购，无需人工确认。',
  }
}
