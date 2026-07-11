import { useCallback, useEffect, useState } from 'react'
import { DEMO_INBOX } from '../demo/demoData'

export interface InboxMessageDto {
  id: string
  type: 'approval' | 'completed' | 'opportunity' | 'blocked'
  source: 'active-service' | 'seller-agent' | 'system'
  runtime: 'live' | 'fixture'
  status: 'unread' | 'pending' | 'resolved' | 'archived'
  merchant: string
  title: string
  receivedAt: string
  category: string
  offer: string
  evidence: string[]
  verdict: 'valuable' | 'neutral' | 'blocked'
  verdictLabel: string
  valueScore: number
  agentEvaluation: string
  requiresAction: boolean
  generatedBy: 'llm' | 'rule'
  memoryRecommended: boolean
  memoryReason: string
  relatedPurchaseId?: string
  transactionId?: string
  chainValid?: boolean
  senderPenaltyDays?: number
}

const FALLBACK_MESSAGES: InboxMessageDto[] = DEMO_INBOX.map((message) => ({
  ...message,
  type: message.verdict === 'blocked' ? 'blocked' : message.relatedPurchaseId === 'camera-lowprice' ? 'approval' : 'opportunity',
  source: 'seller-agent',
  runtime: 'fixture',
  status: message.verdict === 'blocked' ? 'archived' : message.relatedPurchaseId === 'camera-lowprice' ? 'pending' : 'unread',
  receivedAt: new Date().toISOString(),
  requiresAction: message.relatedPurchaseId === 'camera-lowprice',
  generatedBy: 'rule',
}))

function sortMessages(messages: InboxMessageDto[]) {
  return [...messages].sort((left, right) => {
    if (left.runtime !== right.runtime) return left.runtime === 'live' ? -1 : 1
    return Date.parse(right.receivedAt) - Date.parse(left.receivedAt)
  })
}

export function useInbox() {
  const [messages, setMessages] = useState<InboxMessageDto[]>(FALLBACK_MESSAGES)
  const [apiOnline, setApiOnline] = useState(false)
  const [error, setError] = useState<string>()

  const mergeMessage = useCallback((message: InboxMessageDto) => {
    setMessages((current) => sortMessages([message, ...current.filter((item) => item.id !== message.id)]))
  }, [])

  useEffect(() => {
    let active = true
    let source: EventSource | undefined
    void fetch('/api/inbox')
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<{ messages: InboxMessageDto[] }>
      })
      .then((result) => {
        if (!active) return
        setMessages(sortMessages(result.messages))
        setApiOnline(true)
        setError(undefined)
        source = new EventSource('/api/inbox/events')
        const receive = (event: Event) => {
          const update = JSON.parse((event as MessageEvent<string>).data) as { message: InboxMessageDto }
          mergeMessage(update.message)
        }
        source.addEventListener('inbox.message.upserted', receive)
        source.addEventListener('inbox.message.updated', receive)
        source.onerror = () => setApiOnline(false)
      })
      .catch((cause) => {
        if (!active) return
        setApiOnline(false)
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => { active = false; source?.close() }
  }, [mergeMessage])

  const setMemory = useCallback(async (messageId: string, recommended: boolean) => {
    const response = await fetch(`/api/inbox/${messageId}/memory`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recommended }),
    })
    if (!response.ok) throw new Error(`记忆更新失败：HTTP ${response.status}`)
    mergeMessage(await response.json() as InboxMessageDto)
  }, [mergeMessage])

  const archive = useCallback(async (messageId: string) => {
    const response = await fetch(`/api/inbox/${messageId}/archive`, { method: 'POST' })
    if (!response.ok) throw new Error(`归档失败：HTTP ${response.status}`)
    mergeMessage(await response.json() as InboxMessageDto)
  }, [mergeMessage])

  return { messages, apiOnline, error, setMemory, archive }
}

export type InboxRuntime = ReturnType<typeof useInbox>
