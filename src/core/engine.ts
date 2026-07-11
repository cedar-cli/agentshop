/* ============================================================
   模拟引擎 · 一次 tick 推进整个世界
   需求信号 → 竞价 → 成交 → 履约 → 鉴证上链 → 信用回写
   供应链递归 · 风控处置
   ============================================================ */

import { clamp } from './rng'
import { matchScore, buyerWeight, vectorAvg } from './credit'
import type {
  Agent,
  Attestation,
  Category,
  CreditVector,
  DealMessage,
  Preference,
  Proposal,
  Transaction,
  TraceStep,
  Verdict,
  WorldState,
} from './types'
import { CATEGORIES, CREDIT_DIMS } from './types'

const NEUTRAL_PREF: Preference = {
  timeliness: 25,
  spec: 25,
  price: 25,
  afterSales: 25,
}

let seq = 0
const uid = (p: string) => `${p}-${(++seq).toString(36)}`

const rnd = (min: number, max: number) => Math.random() * (max - min) + min
const chance = (p: number) => Math.random() < p

function jitterVector(base: CreditVector, spread: number): CreditVector {
  const j = (v: number) => clamp(v + rnd(-spread, spread))
  return {
    timeliness: j(base.timeliness),
    spec: j(base.spec),
    afterSales: j(base.afterSales),
    compensation: j(base.compensation),
    priceStability: j(base.priceStability),
    packaging: j(base.packaging),
  }
}

/** EWMA 回写：测得分数缓慢牵引卖家画像 */
function blend(prev: number, measured: number, alpha: number): number {
  return clamp(prev * (1 - alpha) + measured * alpha)
}

function buildTrace(v: CreditVector, verdict: 'fulfil' | 'breach'): TraceStep[] {
  return [
    { node: '订单', detail: '参数已锁定 · 智能合约签署', ok: true },
    {
      node: '物流',
      detail: verdict === 'fulfil' ? '按时干线运输' : '中转延误 6h',
      ok: v.timeliness >= 60,
    },
    {
      node: '仓储',
      detail: v.packaging >= 60 ? '零损耗出库' : '包装破损抽检命中',
      ok: v.packaging >= 60,
    },
    {
      node: '质检',
      detail: v.spec >= 60 ? '参数抽检符合标称' : '材质与标称偏差',
      ok: v.spec >= 60,
    },
    {
      node: '售后',
      detail: v.afterSales >= 60 ? '窗口内零争议' : '售后响应超时',
      ok: v.afterSales >= 60,
    },
  ]
}

function makeProposals(
  sellers: Agent[],
  tx: Transaction,
  pref: Preference,
): Proposal[] {
  const bids = sellers
    .filter((s) => s.online && !s.flagged && s.category === tx.category)
    .map((s) => {
      const priceFactor = rnd(0.7, 1.05)
      const price = Math.round(tx.maxPrice * priceFactor)
      const promisedDays = Math.max(
        1,
        Math.round((110 - s.vector.timeliness) / 12 + rnd(-0.5, 1)),
      )
      const ms = matchScore(s, price, tx.maxPrice, promisedDays, pref)
      return {
        sellerId: s.id,
        price,
        promisedDays,
        credit: s.credit,
        matchScore: ms,
        rank: 0,
        won: false,
      }
    })
    .sort((a, b) => b.matchScore - a.matchScore || b.credit - a.credit)

  bids.forEach((b, i) => {
    b.rank = i + 1
    b.won = i === 0
  })
  return bids.slice(0, 6)
}

/** 依成交事实重建一段 A2A 议价成交对话 */
function buildConversation(
  tx: Transaction,
  seller: Agent,
  winner: Proposal | undefined,
  verdict: Verdict,
  scores: CreditVector,
): DealMessage[] {
  const price = tx.price ?? winner?.price ?? tx.maxPrice
  const days = winner?.promisedDays ?? 1
  const competitors = Math.max(1, tx.proposals.length)
  const passed = Math.max(1, Math.round(competitors * 0.4))
  const anchor = Math.round(price * rnd(1.04, 1.1)) // 卖家初始报价（高于成交价）
  const saved = Math.max(0, anchor - price)

  // 找出最强 / 最弱维度，作为卖家亮牌 / 违约归因
  const dims = CREDIT_DIMS.map((d) => ({ short: d.short, v: scores[d.key] }))
  const strong = dims.reduce((a, b) => (b.v > a.v ? b : a))
  const weak = dims.reduce((a, b) => (b.v < a.v ? b : a))

  const conv: DealMessage[] = [
    {
      actor: 'buyer',
      text: `匿名需求轮廓：${tx.category} ×${tx.qty}，预算 ≤¥${tx.maxPrice}，${tx.withinDays} 天内送达；不暴露身份与底价。`,
      meta: '需求 Agent 广播',
    },
    {
      actor: 'seller',
      text: `「${seller.name}」应征：报价 ¥${anchor}，承诺 ${days} 天达，随附链上履约证据。`,
      meta: `信用 ${seller.credit}`,
    },
    {
      actor: 'chain',
      text: `RepChain 校验 ${competitors} 份提案，${passed} 家通过准入，其余因证据不足 / 售后偏低被过滤。`,
      meta: `候选 ${competitors} → ${passed}`,
    },
    {
      actor: 'buyer',
      text: `择优「${seller.name}」：综合匹配最高，不是最低价但硬指标领先。进入议价。`,
    },
    {
      actor: 'seller',
      text: `亮链上履约：${strong.short} ${Math.round(strong.v)} 领先。以延保换价，¥${anchor} → ¥${price}。`,
      meta: saved > 0 ? `让 ¥${saved}` : '锁定',
    },
    {
      actor: 'buyer',
      text: `确认成交 ¥${price}，财务 Agent 托管支付，全程链上留痕。`,
    },
    verdict === 'fulfil'
      ? {
          actor: 'chain',
          text: `履约完成：按时交付、验收通过。自动生成优质鉴证并回写卖家信用，不可删改。`,
          meta: '信用 ↑',
        }
      : {
          actor: 'chain',
          text: `履约异常：${weak.short} 仅 ${Math.round(weak.v)}，未达标。自动生成违约记录，卖家信用下修。`,
          meta: '信用 ↓',
        },
  ]
  return conv
}

function makeAttestation(
  tx: Transaction,
  seller: Agent,
  buyer: Agent,
  tick: number,
): Attestation {
  // 被风控注入的交易：制造异常低分（后续会被识别）
  const spread = tx.tampered ? 4 : 12
  const base = tx.tampered
    ? { ...seller.vector, spec: 20, timeliness: 25, packaging: 22 }
    : seller.vector
  const scores = jitterVector(base as CreditVector, spread)
  const overall = Math.round(vectorAvg(scores))
  const verdict = overall >= 58 && scores.spec >= 45 ? 'fulfil' : 'breach'
  const weight = buyerWeight(buyer.credit, buyer.professional)
  const winner = tx.proposals.find((p) => p.won)
  const price = tx.price ?? winner?.price ?? tx.maxPrice
  return {
    id: uid('att'),
    txId: tx.id,
    sellerId: seller.id,
    sellerName: seller.name,
    sellerCredit: seller.credit,
    buyerId: buyer.id,
    buyerName: buyer.name,
    category: tx.category,
    verdict,
    price,
    competitors: Math.max(1, tx.proposals.length),
    promisedDays: winner?.promisedDays ?? 1,
    scores,
    overall,
    weight,
    buyerCredit: buyer.credit,
    professional: buyer.professional,
    tick,
    conversation: buildConversation(tx, seller, winner, verdict, scores),
    trace: buildTrace(scores, verdict),
  }
}

interface StepResult {
  agents: Record<string, Agent>
  transactions: Transaction[]
  newAttestations: Attestation[]
}

/**
 * 推进一步。返回变更后的实体（store 负责合并与裁剪）。
 * 采用受控更新：仅对发生状态迁移的实体建新对象。
 */
export function step(world: WorldState): StepResult {
  const tick = world.tick + 1
  const agents: Record<string, Agent> = { ...world.agents }
  const sellersAll = Object.values(agents).filter((a) => a.role === 'seller')
  const consumers = Object.values(agents).filter(
    (a) => a.role === 'consumer' && a.online,
  )
  const supplyAll = Object.values(agents).filter(
    (a) => a.role === 'supply' || a.role === 'factory',
  )

  const newAttestations: Attestation[] = []
  let txs = world.transactions.map((t) => t) // 浅拷贝数组

  // 1) 推进已有交易生命周期
  txs = txs.map((tx) => {
    if (tick - tx.statusTick < 1) return tx
    switch (tx.status) {
      case 'signal': {
        const buyer = agents[tx.buyerId]
        const pref =
          tx.buyerId === world.meConsumerId ? world.preference : NEUTRAL_PREF
        const pool = tx.upstream ? supplyAll : sellersAll
        const proposals = makeProposals(pool as Agent[], tx, pref)
        if (proposals.length === 0) return tx
        void buyer
        return { ...tx, status: 'bidding', proposals, statusTick: tick }
      }
      case 'bidding': {
        const winner = tx.proposals.find((p) => p.won)
        if (!winner) return { ...tx, status: 'attested', statusTick: tick }
        return {
          ...tx,
          status: 'settled',
          sellerId: winner.sellerId,
          price: winner.price,
          statusTick: tick,
        }
      }
      case 'settled':
        return { ...tx, status: 'fulfilling', statusTick: tick }
      case 'fulfilling': {
        if (tick - tx.statusTick < 2) return tx
        const seller = tx.sellerId ? agents[tx.sellerId] : null
        const buyer = agents[tx.buyerId]
        if (!seller || !buyer)
          return { ...tx, status: 'attested', statusTick: tick }
        const att = makeAttestation(tx, seller, buyer, tick)
        newAttestations.push(att)
        // 信用回写（权重越高牵引越强）
        const alpha = Math.min(0.25, 0.03 * att.weight + 0.02)
        const nv: CreditVector = {
          timeliness: blend(seller.vector.timeliness, att.scores.timeliness, alpha),
          spec: blend(seller.vector.spec, att.scores.spec, alpha),
          afterSales: blend(seller.vector.afterSales, att.scores.afterSales, alpha),
          compensation: blend(
            seller.vector.compensation,
            att.scores.compensation,
            alpha,
          ),
          priceStability: blend(
            seller.vector.priceStability,
            att.scores.priceStability,
            alpha,
          ),
          packaging: blend(seller.vector.packaging, att.scores.packaging, alpha),
        }
        agents[seller.id] = {
          ...seller,
          vector: nv,
          credit: Math.round(vectorAvg(nv)),
          dealCount: seller.dealCount + 1,
        }
        return { ...tx, status: 'attested', statusTick: tick }
      }
      default:
        return tx
    }
  })

  // 2) 生成新需求信号（消费者侧）
  const activeCount = txs.filter((t) => t.status !== 'attested').length
  if (activeCount < 14 && consumers.length) {
    const n = 1 + (chance(0.5) ? 1 : 0)
    for (let i = 0; i < n; i++) {
      const buyer = consumers[Math.floor(Math.random() * consumers.length)]
      txs.push(newSignal(buyer, tick, false))
    }
  }

  // 3) 供应链递归：卖家补货触发上游采购（供应链 Agent 作为买家）
  if (chance(0.35) && sellersAll.length) {
    const s = sellersAll[Math.floor(Math.random() * sellersAll.length)]
    const supplyBuyer = supplyAll.find(
      (u) => u.role === 'supply' && u.category === s.category,
    )
    if (supplyBuyer) {
      txs.push(newSignal(supplyBuyer, tick, true, s.category))
    }
  }

  // 4) 裁剪：仅保留最近未完成 + 少量已完成尾巴
  const attested = txs.filter((t) => t.status === 'attested')
  const live = txs.filter((t) => t.status !== 'attested')
  const trimmed = [...live, ...attested.slice(-24)]

  return { agents, transactions: trimmed, newAttestations }
}

function newSignal(
  buyer: Agent,
  tick: number,
  upstream: boolean,
  forceCat?: Category,
): Transaction {
  const category = forceCat ?? buyer.category ?? CATEGORIES[0]
  return {
    id: uid('tx'),
    buyerId: buyer.id,
    sellerId: null,
    category,
    maxPrice: Math.round(rnd(30, 900)),
    withinDays: Math.round(rnd(1, 7)),
    qty: Math.round(rnd(1, 300)),
    status: 'signal',
    proposals: [],
    price: null,
    createdTick: tick,
    statusTick: tick,
    upstream,
  }
}

/** 手动发布主视角消费者的需求（消费者端交互） */
export function emitDemand(
  world: WorldState,
  category: Category,
  maxPrice: number,
  withinDays: number,
  qty: number,
): Transaction {
  return {
    id: uid('tx'),
    buyerId: world.meConsumerId,
    sellerId: null,
    category,
    maxPrice,
    withinDays,
    qty,
    status: 'signal',
    proposals: [],
    price: null,
    createdTick: world.tick,
    statusTick: world.tick - 1, // 下一 tick 立即进入竞价
    upstream: false,
  }
}
