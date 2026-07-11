import { useTransactionStream } from '../components/live/useTransactionStream'

export const ACTIVE_SALES_EVENT_TYPES = [
  'active-sale.product.ingested',
  'active-sale.passport.published',
  'active-sale.buyer.matched',
  'active-sale.proposal.routed',
  'active-sale.proposal.blocked',
  'active-sale.buyer.selected',
  'active-sale.completed',
] as const

export function useActiveSales() {
  const stream = useTransactionStream(ACTIVE_SALES_EVENT_TYPES, 'active-sale.completed')
  return {
    ...stream,
    start: () => stream.start({ endpoint: '/api/seller/products/NB-401/activate' }),
  }
}
