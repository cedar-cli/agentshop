/* 派生选择器：品类排行、鉴证聚合、决策集 */

import type {
  Agent,
  Attestation,
  Category,
  CreditVector,
  Transaction,
} from './types'
import { CREDIT_DIMS } from './types'

type AgentMap = Record<string, Agent>

export const agentsByRole = (agents: AgentMap, role: Agent['role']): Agent[] =>
  Object.values(agents).filter((a) => a.role === role)

export const sellersOf = (agents: AgentMap, category: Category): Agent[] =>
  Object.values(agents).filter(
    (a) => a.role === 'seller' && a.category === category,
  )

/** 全网品类信用榜：按综合信用降序，风控节点沉底（§3.4 第三层） */
export function categoryRanking(
  agents: AgentMap,
  category: Category,
  dim?: keyof CreditVector,
): Agent[] {
  return sellersOf(agents, category)
    .slice()
    .sort((a, b) => {
      if (a.flagged !== b.flagged) return a.flagged ? 1 : -1
      const av = dim ? a.vector[dim] : a.credit
      const bv = dim ? b.vector[dim] : b.credit
      return bv - av
    })
}

export const sellerAttestations = (
  attestations: Attestation[],
  sellerId: string,
): Attestation[] => attestations.filter((a) => a.sellerId === sellerId)

export const consumerAttestations = (
  attestations: Attestation[],
  buyerId: string,
): Attestation[] => attestations.filter((a) => a.buyerId === buyerId)

/** 主视角消费者当前进行中的交易（决策集来源） */
export function myTransactions(
  transactions: Transaction[],
  meConsumerId: string,
): Transaction[] {
  return transactions.filter((t) => t.buyerId === meConsumerId)
}

/** 活跃匹配链路（用于拓扑连线） */
export function activeLinks(
  transactions: Transaction[],
): Array<{ from: string; to: string; status: string; upstream: boolean }> {
  const links: Array<{
    from: string
    to: string
    status: string
    upstream: boolean
  }> = []
  for (const tx of transactions) {
    if (tx.status === 'attested') continue
    if (tx.status === 'bidding') {
      for (const p of tx.proposals.slice(0, 4)) {
        links.push({
          from: p.sellerId,
          to: tx.buyerId,
          status: 'bidding',
          upstream: tx.upstream,
        })
      }
    } else if (tx.sellerId) {
      links.push({
        from: tx.sellerId,
        to: tx.buyerId,
        status: tx.status,
        upstream: tx.upstream,
      })
    }
  }
  return links
}

/** 品类维度榜单预设（§4/§6.7③） */
export const RANKING_PRESETS: Array<{
  category: Category
  dim: keyof CreditVector
  label: string
}> = [
  { category: '生鲜', dim: 'timeliness', label: '低温配送达标率' },
  { category: '3C数码', dim: 'afterSales', label: '售后响应时效' },
  { category: '日用百货', dim: 'priceStability', label: '价格稳定度' },
  { category: '服饰', dim: 'spec', label: '参数符合度' },
]

export { CREDIT_DIMS }
