import { describe, expect, it } from 'vitest'
import type { StoredEvent } from '../components/live/types'
import { DEMO_PURCHASES } from './demoData'
import { adaptLaptopPurchase } from './laptopRuntime'

const base = DEMO_PURCHASES.find((purchase) => purchase.id === 'laptop-trip')!

function event(type: string, sequence: number, payload: Record<string, unknown>): StoredEvent {
  return {
    id: `event-${sequence}`,
    transactionId: 'tx-laptop',
    type,
    source: 'test-agent',
    timestamp: '2026-07-12T10:00:00+08:00',
    sequence,
    payload,
  }
}

describe('adaptLaptopPurchase', () => {
  it('将真实交易事件转换成现有购买历史模型', () => {
    const events = [
      event('laptop.intent.structured', 1, {
        product: '14 英寸 AI 轻薄本', budgetCny: 9000, deadlineHours: 72,
        maxWeightKg: 1.3, minBatteryHours: 12, requiresNationalWarranty: true,
        priorities: { timeliness: 30, spec: 30, price: 25, afterSales: 15 }, generatedBy: 'llm',
      }),
      event('laptop.proposal.submitted', 2, {
        sellerId: 'cloud', displayName: '云仓·旗舰店', quotedPriceCny: 8799, listPriceCny: 8799,
        deliveryHours: 24, weightKg: 1.25, batteryHours: 14, warrantyYears: 3,
        nationalWarranty: true, reputation: 88,
        metrics: { timeliness: 95, spec: 95, afterSales: 96, price: 62 },
        reasoning: '次日达并提供三年联保', generatedBy: 'llm',
      }),
      event('laptop.seller.selected', 3, {
        sellerId: 'cloud', displayName: '云仓·旗舰店', score: 86.9, reason: '综合效用最高',
      }),
      event('laptop.counter.response', 4, {
        finalPriceCny: 8499, concessionCny: 300, reasoning: '接受目标价', generatedBy: 'llm',
      }),
      event('laptop.approval.requested', 5, { reason: '等待确认', expiresInMinutes: 20 }),
    ]

    const purchase = adaptLaptopPurchase(base, events)
    expect(purchase.status).toBe('awaiting')
    expect(purchase.paid).toBe(8499)
    expect(purchase.saved).toBe(501)
    expect(purchase.offers[0]).toMatchObject({ seller: '云仓·旗舰店', selected: true, price: 8499 })
    expect(purchase.events.some((item) => item.origin === 'llm')).toBe(true)
  })
})
