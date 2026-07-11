import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoredEvent } from '../live/types'
import { IntentGrowthField } from './IntentGrowthField'

const runtime = vi.hoisted(() => ({
  phase: 'completed' as const,
  events: [] as StoredEvent[],
  transactionId: 'tx-growth',
  chainValid: true,
  error: undefined,
  start: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('../../hooks/useIntentGrowth', () => ({ useIntentGrowth: () => runtime }))

const event = (sequence: number, type: string, payload: Record<string, unknown>): StoredEvent => ({
  id: `event-${sequence}`, transactionId: 'tx-growth', type, source: 'test-agent',
  timestamp: '2026-07-12T06:00:00+08:00', sequence, payload,
})

afterEach(() => { runtime.events = []; vi.clearAllMocks() })

describe('IntentGrowthField', () => {
  it('renders the product upgrade, signed order and rank lift from backend events', () => {
    runtime.events = [
      event(1, 'intent-growth.product.version.published', {
        productName: 'LumaCalm 可验证共享托育睡眠方案', version: 'v2.2',
        coverageBefore: 61, coverageAfter: 91, summary: '商品字段已更新',
      }),
      event(2, 'intent-growth.buyer.rematched', {
        buyerName: 'Little Steps Daycare', quantity: 80, deadlineDays: 9,
        requirements: ['托育场景'], scoreBefore: 78, scoreAfter: 96, rankBefore: 3, rankAfter: 2,
        scoreBreakdown: { context: 96, wash: 98, durability: 94, bulkSla: 96 },
      }),
      event(3, 'intent-growth.order.signed', {
        orderId: 'LS-8804', buyerName: 'Little Steps Daycare', quantity: 80,
        unitPriceUsd: 112, totalUsd: 8960, deliveryDays: 9, delayPenaltyPercent: 3,
      }),
      event(4, 'intent-growth.attestation.issued', {
        trustDelta: 12, evidenceVerified: true, slaHonored: true, simulatedFulfillment: true,
      }),
      event(5, 'intent-growth.rank.updated', {
        rankBefore: 3, rankAfter: 1, scoreBefore: 78, scoreAfter: 98,
        shortlistRateBefore: 12, shortlistRateAfter: 31,
        ordersPerDayBefore: 3, ordersPerDayAfter: 19, projectedNewIntents: 16,
      }),
    ]

    render(<IntentGrowthField />)
    expect(screen.getByText('LumaCalm 可验证共享托育睡眠方案')).toBeInTheDocument()
    expect(screen.getAllByText('$8,960').length).toBeGreaterThan(0)
    expect(screen.getAllByText('#1').length).toBeGreaterThan(0)
    expect(screen.getByText('REPCHAIN ATTESTED · +12 TRUST')).toBeInTheDocument()
    expect(screen.getByText('闭环完成 · 每笔订单开始下一轮学习')).toBeInTheDocument()
  })
})
