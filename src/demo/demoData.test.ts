import { describe, expect, it } from 'vitest'
import {
  DEMO_INBOX,
  DEMO_PURCHASES,
  SALES_MECHANISMS,
  getMechanismById,
  getPurchaseById,
  getPurchasesByScene,
} from './demoData'

describe('投资人演示数据契约', () => {
  it('覆盖四种 A2A 销售机制且每种都有过程与影响指标', () => {
    expect(SALES_MECHANISMS.map((item) => item.id)).toEqual([
      'precision',
      'distribution',
      'reputation',
      'broadcast',
    ])
    for (const mechanism of SALES_MECHANISMS) {
      expect(mechanism.steps.length).toBeGreaterThanOrEqual(4)
      expect(mechanism.metrics.length).toBeGreaterThanOrEqual(3)
      expect(mechanism.buyerRecordId).toBeTruthy()
      expect(getMechanismById(mechanism.id)?.id).toBe(mechanism.id)
    }
  })

  it('覆盖被动购买与四种主动服务，并保留完整交易阶段', () => {
    const scenes = ['passive', 'restock', 'scarce', 'lowprice', 'secondhand'] as const
    for (const scene of scenes) {
      const purchases = getPurchasesByScene(scene)
      expect(purchases.length).toBeGreaterThan(0)
      expect(purchases[0].events.length).toBeGreaterThanOrEqual(6)
    }
    expect(DEMO_PURCHASES.some((item) => item.mode === 'autonomous')).toBe(true)
    expect(DEMO_PURCHASES.some((item) => item.mode === 'approval')).toBe(true)
  })

  it('每条购买记录可回放卖家沟通、比较、议价、履约与鉴证', () => {
    for (const purchase of DEMO_PURCHASES) {
      const kinds = new Set(purchase.events.map((event) => event.kind))
      expect(kinds.has('seller-message')).toBe(true)
      expect(kinds.has('comparison')).toBe(true)
      expect(kinds.has('negotiation')).toBe(true)
      expect(kinds.has('fulfilment')).toBe(true)
      expect(kinds.has('attestation')).toBe(true)
      expect(getPurchaseById(purchase.id)?.id).toBe(purchase.id)
    }
  })

  it('Inbox 营销信息包含价值判断与是否写入记忆的决定', () => {
    expect(DEMO_INBOX.length).toBeGreaterThanOrEqual(3)
    for (const message of DEMO_INBOX) {
      expect(message.agentEvaluation.length).toBeGreaterThan(12)
      expect(['valuable', 'neutral', 'blocked']).toContain(message.verdict)
      expect(typeof message.memoryRecommended).toBe('boolean')
    }
  })
})
