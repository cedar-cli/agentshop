import { useCallback, useEffect, useState } from 'react'
import type { StoredEvent } from '../components/live/types'

export interface MerchantTransactionDto {
  id: string
  kind: string
  status: string
  statusLabel: string
  buyerName: string
  product: string
  category: string
  mechanism: string
  constraints: string[]
  budget?: number
  amount?: number
  currency: 'CNY' | 'USD'
  winner?: string
  score?: number
  updatedAt: string
  events: StoredEvent[]
  chainValid: boolean
}

function sortTransactions(transactions: MerchantTransactionDto[]) {
  return [...transactions].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

export function useMerchantTransactions() {
  const [transactions, setTransactions] = useState<MerchantTransactionDto[]>([])
  const [apiOnline, setApiOnline] = useState(false)

  const merge = useCallback((transaction: MerchantTransactionDto) => {
    setTransactions((current) => sortTransactions([transaction, ...current.filter((item) => item.id !== transaction.id)]))
  }, [])

  useEffect(() => {
    let active = true
    let source: EventSource | undefined
    void fetch('/api/merchant/transactions')
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<{ transactions: MerchantTransactionDto[] }>
      })
      .then((result) => {
        if (!active) return
        setTransactions(sortTransactions(result.transactions))
        setApiOnline(true)
        source = new EventSource('/api/merchant/transactions/events')
        source.addEventListener('merchant.transaction.upserted', (event) => {
          const update = JSON.parse((event as MessageEvent<string>).data) as { transaction: MerchantTransactionDto }
          merge(update.transaction)
        })
        source.onerror = () => setApiOnline(false)
      })
      .catch(() => { if (active) setApiOnline(false) })
    return () => { active = false; source?.close() }
  }, [merge])

  return { transactions, apiOnline }
}
