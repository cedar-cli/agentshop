import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InboxRuntime } from '../hooks/useInbox'
import { ConsumerInbox } from './consumer/ConsumerInbox'
import { MerchantModule } from './merchant/MerchantModule'

class EventSourceMock {
  onerror: (() => void) | null = null
  constructor(public readonly url: string) {}
  addEventListener() {}
  close() {}
}

afterEach(() => vi.unstubAllGlobals())

const event = {
  id: 'event-complete', transactionId: 'tx-shared', type: 'active-sale.completed',
  source: 'mia-buyer-agent', target: 'seller-agent', timestamp: '2026-07-12T05:00:00+08:00', sequence: 1,
  payload: { productName: 'Newborn CalmSleep Kit', amountUsd: 164, humanClicks: 0 },
}

describe('消费者端与商家端共享交易投影', () => {
  it('商家战情加载消费者侧产生的真实 transaction', async () => {
    vi.stubGlobal('EventSource', EventSourceMock)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        transactions: [{
          id: 'tx-shared', kind: 'active-sales-demo', status: 'completed', statusLabel: '已完成',
          buyerName: 'Mia Park · New Parent', product: 'Newborn CalmSleep Kit', category: '母婴床品',
          mechanism: '授权 Inbox 主动销售', constraints: ['预算 ≤$180'], budget: 180, amount: 164,
          currency: 'USD', winner: 'DeepLumen Seller Agent', score: 94,
          updatedAt: '2026-07-12T05:00:00+08:00', events: [event], chainValid: true,
        }],
      }),
    })))
    render(<MerchantModule />)
    expect(await screen.findByText('Mia Park · New Parent')).toBeInTheDocument()
    expect(screen.getByText('Newborn CalmSleep Kit')).toBeInTheDocument()
    expect(screen.getByText('1 LIVE API')).toBeInTheDocument()
  })

  it('消费者 Inbox 可以打开同一 transaction 的事件链', async () => {
    vi.stubGlobal('EventSource', EventSourceMock)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'tx-shared', status: 'completed', events: [event], chainValid: true }),
    })))
    const inbox = {
      messages: [{
        id: 'inbox-shared', type: 'completed', source: 'seller-agent', runtime: 'live', status: 'unread',
        merchant: 'DeepLumen Seller Agent', title: '授权主动提案已自动成交', receivedAt: '2026-07-12T05:00:00+08:00',
        category: '母婴床品', offer: '$164', evidence: ['Hash Chain verified'], verdict: 'valuable',
        verdictLabel: '自动成交', valueScore: 94, agentEvaluation: '提案满足全部授权条件。', requiresAction: false,
        generatedBy: 'llm', memoryRecommended: true, memoryReason: '记录偏好', transactionId: 'tx-shared', chainValid: true,
      }],
      apiOnline: true,
      error: undefined,
      setMemory: vi.fn(),
      archive: vi.fn(),
    } as unknown as InboxRuntime
    const user = userEvent.setup()
    render(<ConsumerInbox onOpenPurchase={vi.fn()} inbox={inbox} />)
    await user.click(screen.getByRole('button', { name: '查看共享交易链' }))
    expect(await screen.findByText('消费者与商家共享事件链')).toBeInTheDocument()
    expect(screen.getByText('授权范围内自动成交')).toBeInTheDocument()
    expect(screen.getByText('tx-shared')).toBeInTheDocument()
  })
})
