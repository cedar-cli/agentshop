import { describe, expect, it } from 'vitest'
import type { StoredEvent } from '../components/live/types'
import { DEMO_PURCHASES } from './demoData'
import { adaptRestockPurchase, restockMonitoringPurchase } from './restockRuntime'

const base = DEMO_PURCHASES.find((purchase) => purchase.id === 'paper-restock')!
const event = (type: string, sequence: number, payload: Record<string, unknown>): StoredEvent => ({
  id: `restock-${sequence}`, transactionId: 'tx-restock', type, source: 'test',
  timestamp: '2026-07-12T10:00:00+08:00', sequence, payload,
})
describe('restock runtime adapter', () => {
  it('starts in monitoring mode with no purchase amount', () => {
    expect(restockMonitoringPurchase(base)).toMatchObject({ status: 'monitoring', paid: 0, statusLabel: '持续监测' })
  })

  it('marks the autonomous flow completed without human interaction', () => {
    const purchase = adaptRestockPurchase(base, [
      event('restock.order.authorized', 1, { amountCny: 118, checks: ['品类在白名单'], humanInteractions: 0 }),
      event('restock.order.confirmed', 2, { totalPriceCny: 118, displayName: '云仓·旗舰店' }),
      event('restock.notification.sent', 3, { summary: '家庭补库已自动完成' }),
    ])
    expect(purchase).toMatchObject({ status: 'completed', paid: 118, statusLabel: '自动完成' })
    expect(purchase.result).toContain('人类交互 0 次')
  })
})
