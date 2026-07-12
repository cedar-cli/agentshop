import { useTransactionStream } from '../components/live/useTransactionStream'

export const INTENT_GROWTH_EVENT_TYPES = [
  'intent-growth.market.ranked',
  'intent-growth.seller.shortlisted',
  'intent-growth.dialogue.round',
  'intent-growth.seller.lost',
  'intent-growth.learning.started',
  'intent-growth.intent.extracted',
  'intent-growth.gap.detected',
  'intent-growth.product.field.updated',
  'intent-growth.product.version.published',
  'intent-growth.buyer.rematched',
  'intent-growth.quote.requested',
  'intent-growth.terms.negotiated',
  'intent-growth.order.signed',
  'intent-growth.attestation.issued',
  'intent-growth.rank.updated',
] as const

export function useIntentGrowth() {
  const stream = useTransactionStream(INTENT_GROWTH_EVENT_TYPES, 'intent-growth.rank.updated')
  return { ...stream, start: () => stream.start({ endpoint: '/api/seller/intent-growth' }) }
}
