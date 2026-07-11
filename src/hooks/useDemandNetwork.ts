import { useTransactionStream } from '../components/live/useTransactionStream'

export const DEMAND_NETWORK_EVENT_TYPES = [
  'demand.need.received',
  'demand.intent.structured',
  'demand.market.aggregated',
  'demand.product.forecasted',
  'demand.supply.negotiated',
  'demand.batch.completed',
  'distribution.contract.published',
  'distribution.agent.matched',
  'distribution.orders.completed',
  'distribution.commission.released',
] as const

export function useDemandNetwork() {
  const stream = useTransactionStream(DEMAND_NETWORK_EVENT_TYPES, 'distribution.commission.released')
  return {
    ...stream,
    start: (commissionRate: number, maxDiscountPercent: number) => stream.start({
      endpoint: '/api/seller/demand-network',
      body: { commissionRate, maxDiscountPercent },
    }),
  }
}
