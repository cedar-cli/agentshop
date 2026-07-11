import { useCallback } from 'react'
import { useTransactionStream } from '../components/live/useTransactionStream'

const RESTOCK_EVENTS = [
  'restock.time.advanced', 'restock.inventory.forecasted', 'restock.authorization.checked',
  'restock.intent.created', 'restock.proposal.submitted', 'restock.seller.selected',
  'restock.bundle.negotiated', 'restock.order.authorized', 'restock.order.confirmed',
  'restock.inventory.updated', 'restock.memory.updated', 'restock.notification.sent',
] as const

export function useHouseholdRestock() {
  const stream = useTransactionStream(RESTOCK_EVENTS, 'restock.notification.sent')
  const start = useCallback(() => {
    stream.start({ endpoint: '/api/active-services/household-restock/trigger' })
  }, [stream])
  return { ...stream, start }
}

export type HouseholdRestockRuntime = ReturnType<typeof useHouseholdRestock>
