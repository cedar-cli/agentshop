import { describe, expect, it } from 'vitest'
import {
  ECO_YEAR_DAYS,
  createSim,
  diagnose,
  ranking,
  stepSim,
  type Archetype,
  type EcoSim,
  type FactorKey,
} from './evolution'
import type { Category } from './types'

const CAT: Category = '3C数码'

const sellers = [
  { id: 'S1', name: '优等生', category: CAT, credit: 86 },
  { id: 'S2', name: '夸大党', category: CAT, credit: 74 },
  { id: 'S3', name: '慢郎中', category: CAT, credit: 72 },
  { id: 'S4', name: '甩手掌柜', category: CAT, credit: 70 },
  { id: 'S5', name: '选品跑偏', category: CAT, credit: 68 },
  { id: 'S6', name: '价格高', category: CAT, credit: 66 },
  { id: 'X1', name: '别的品类', category: '生鲜' as Category, credit: 95 },
]

function runYear(seed = 42): EcoSim {
  let sim = createSim(sellers, CAT, seed)
  let guard = 0
  while (sim.day < ECO_YEAR_DAYS && guard++ < 500) sim = stepSim(sim)
  return sim
}

const byArchetype = (sim: EcoSim, a: Archetype) =>
  sim.merchants.find((m) => m.archetype === a)!

describe('evolution · 事件驱动交易模拟', () => {
  it('createSim 只取本品类，信用最高者为优等生，其余分配不同短板', () => {
    const sim = createSim(sellers, CAT, 42)
    expect(sim.merchants).toHaveLength(6)
    expect(sim.merchants[0].archetype).toBe('diligent')
    const archetypes = new Set(sim.merchants.map((m) => m.archetype))
    // 至少覆盖优等生 + 若干种短板
    expect(archetypes.has('diligent')).toBe(true)
    expect(archetypes.size).toBeGreaterThanOrEqual(4)
  })

  it('stepSim 推进天数并产生带归因的交易', () => {
    const sim = stepSim(createSim(sellers, CAT, 42))
    expect(sim.day).toBeGreaterThan(0)
    expect(sim.deals.length).toBeGreaterThan(0)
    for (const deal of sim.deals) {
      expect(['happy', 'unhappy', 'lost']).toContain(deal.outcome)
      expect(deal.intent.length).toBeGreaterThan(0)
      if (deal.outcome !== 'happy') expect(deal.issue).toBeTruthy()
    }
  })

  it('确定性：同 seed 跑满一年，结果完全一致', () => {
    const a = runYear(42)
    const b = runYear(42)
    expect(a.merchants.map((m) => Math.round(m.credit))).toEqual(
      b.merchants.map((m) => Math.round(m.credit)),
    )
  })

  it('一年后优等生爬上榜首，未被降级', () => {
    const sim = runYear(42)
    const board = ranking(sim)
    expect(board[0].archetype).toBe('diligent')
    expect(board[0].flagged).toBe(false)
    expect(board.map((m) => m.rank)).toEqual([1, 2, 3, 4, 5, 6])
  })

  const expected: Array<[Archetype, FactorKey]> = [
    ['overclaim', 'listing'],
    ['slow', 'fulfilment'],
    ['careless', 'service'],
    ['mismatch', 'selection'],
    ['pricey', 'price'],
  ]
  it.each(expected)(
    '归因正确：%s 的主要问题是 %s',
    (archetype, factor) => {
      const sim = runYear(42)
      const merchant = byArchetype(sim, archetype)
      const report = diagnose(merchant)
      expect(report.topIssue).toBe(factor)
    },
  )

  it('诊断报告含结果总结与可执行改进建议', () => {
    const sim = runYear(42)
    const board = ranking(sim)
    const weakest = board[board.length - 1]
    const report = diagnose(weakest, weakest.rank)
    expect(report.summary).toMatch(/成交|降级/)
    expect(report.advice.length).toBeGreaterThan(8)
    expect(report.creditFrom).toBeGreaterThan(0)
  })

  it('ranking：风控降级的商家沉底', () => {
    const sim = runYear(42)
    const board = ranking(sim)
    const flaggedIdx = board.findIndex((m) => m.flagged)
    if (flaggedIdx >= 0) {
      // 所有 flagged 都排在未 flagged 之后
      const firstFlagged = flaggedIdx
      for (let i = firstFlagged; i < board.length; i++) {
        expect(board[i].flagged).toBe(true)
      }
    }
  })
})
