import { useCallback, useState } from 'react'
import { useTransactionStream } from '../components/live/useTransactionStream'

const LAPTOP_EVENTS = [
  'laptop.purchase.requested',
  'laptop.intent.structured',
  'laptop.proposal.submitted',
  'laptop.seller.rejected',
  'laptop.seller.selected',
  'laptop.counter.offer',
  'laptop.counter.response',
  'laptop.approval.requested',
  'laptop.order.confirmed',
  'laptop.fulfillment.updated',
  'laptop.attestation.issued',
] as const

export const DEFAULT_LAPTOP_REQUEST = '下周出差前买一台轻薄本，预算 9000 元，续航优先，重量不超过 1.3kg，3 天内送达，必须有全国联保。'

export function useLaptopPurchase() {
  const stream = useTransactionStream(LAPTOP_EVENTS, 'laptop.attestation.issued')
  const [approving, setApproving] = useState(false)
  const [approvalError, setApprovalError] = useState<string>()

  const start = useCallback((requestText = DEFAULT_LAPTOP_REQUEST) => {
    setApprovalError(undefined)
    stream.start({ endpoint: '/api/demo/laptop-purchase', body: { requestText } })
  }, [stream])

  const approve = useCallback(async () => {
    if (!stream.transactionId || approving) return
    setApproving(true)
    setApprovalError(undefined)
    try {
      const response = await fetch(`/api/transactions/${stream.transactionId}/approve`, { method: 'POST' })
      if (!response.ok) throw new Error(`确认失败：HTTP ${response.status}`)
    } catch (cause) {
      setApprovalError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setApproving(false)
    }
  }, [approving, stream.transactionId])

  return {
    ...stream,
    start,
    approve,
    approving,
    error: approvalError ?? stream.error,
    awaitingApproval: stream.events.some((event) => event.type === 'laptop.approval.requested') && !stream.events.some((event) => event.type === 'laptop.order.confirmed'),
  }
}
