import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  StoredEvent,
  TransactionSnapshot,
  TransactionStartResponse,
} from '../components/live/types'
import type { LivePhase } from '../components/live/useTransactionStream'

// 委托任务复用真实 LLM 轻薄本采购工作流的事件序列；终止事件为链上鉴证。
const DELEGATION_EVENTS = [
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
const TERMINAL_EVENT = 'laptop.attestation.issued'

// 主动服务方式：auto=全权代买（默认，无需 @）；其余对应四类主动服务场景。
export type DelegationMode = 'auto' | 'restock' | 'scarce' | 'lowprice' | 'secondhand'

export interface DelegationSession {
  localId: string
  requestText: string
  mode: DelegationMode
  createdAt: number
  transactionId?: string
  phase: LivePhase
  events: StoredEvent[]
  error?: string
}

export interface ConsumerDelegationsRuntime {
  sessions: DelegationSession[]
  create: (requestText: string, mode: DelegationMode) => string
  reset: () => void
}

let delegationCounter = 0
function nextLocalId(): string {
  delegationCounter += 1
  return `delegation-${Date.now().toString(36)}-${delegationCounter}`
}

/**
 * 管理消费者「新增委托任务」的多会话运行时。
 *
 * 每个委托是一次独立的真实 LLM 采购交易：create() 触发后端 consumer-delegation，
 * 打开独立 SSE 事件流实时累积事件；SSE 断开时回退为快照轮询，直至交易 settled。
 * 全部会话共存于内存，可同时进行、随时切换查看，Agent 全自动完成、无需人工确认。
 */
export function useConsumerDelegations(): ConsumerDelegationsRuntime {
  const [sessions, setSessions] = useState<DelegationSession[]>([])
  const sourcesRef = useRef<Map<string, EventSource>>(new Map())
  const pollRef = useRef<Map<string, number>>(new Map())

  const closeStream = useCallback((localId: string) => {
    sourcesRef.current.get(localId)?.close()
    sourcesRef.current.delete(localId)
    const timer = pollRef.current.get(localId)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      pollRef.current.delete(localId)
    }
  }, [])

  const patchSession = useCallback(
    (localId: string, patch: Partial<DelegationSession>) => {
      setSessions((current) =>
        current.map((session) =>
          session.localId === localId ? { ...session, ...patch } : session,
        ),
      )
    },
    [],
  )

  const mergeEvent = useCallback((localId: string, incoming: StoredEvent) => {
    setSessions((current) =>
      current.map((session) => {
        if (session.localId !== localId) return session
        if (session.events.some((event) => event.id === incoming.id)) return session
        const events = [...session.events, incoming].sort((a, b) => a.sequence - b.sequence)
        const completed = incoming.type === TERMINAL_EVENT
        return {
          ...session,
          events,
          phase: completed ? 'completed' : 'running',
        }
      }),
    )
  }, [])

  const loadSnapshot = useCallback(
    async (localId: string, transactionId: string): Promise<TransactionSnapshot | undefined> => {
      const response = await fetch(`/api/transactions/${transactionId}`)
      if (!response.ok) return undefined
      const snapshot = (await response.json()) as TransactionSnapshot
      setSessions((current) =>
        current.map((session) => {
          if (session.localId !== localId) return session
          const phase: LivePhase =
            snapshot.status === 'completed'
              ? 'completed'
              : snapshot.status === 'failed'
                ? 'failed'
                : session.phase
          return {
            ...session,
            events: snapshot.events,
            phase,
            error: snapshot.status === 'failed' ? snapshot.error ?? '交易执行失败' : session.error,
          }
        }),
      )
      return snapshot
    },
    [],
  )

  const pollUntilSettled = useCallback(
    (localId: string, transactionId: string) => {
      const poll = async () => {
        try {
          const snapshot = await loadSnapshot(localId, transactionId)
          if (snapshot?.status === 'completed' || snapshot?.status === 'failed') {
            pollRef.current.delete(localId)
            return
          }
        } catch {
          // 现场网络抖动不应中断展示，下一轮继续尝试。
        }
        pollRef.current.set(localId, window.setTimeout(() => void poll(), 400))
      }
      void poll()
    },
    [loadSnapshot],
  )

  const connect = useCallback(
    (localId: string, transactionId: string, eventsUrl: string) => {
      const source = new EventSource(eventsUrl)
      sourcesRef.current.set(localId, source)
      for (const eventType of DELEGATION_EVENTS) {
        source.addEventListener(eventType, (message) => {
          const event = JSON.parse((message as MessageEvent<string>).data) as StoredEvent
          mergeEvent(localId, event)
          if (event.type === TERMINAL_EVENT) {
            closeStream(localId)
            void loadSnapshot(localId, transactionId)
          }
        })
      }
      source.onerror = () => {
        closeStream(localId)
        pollUntilSettled(localId, transactionId)
      }
    },
    [closeStream, loadSnapshot, mergeEvent, pollUntilSettled],
  )

  const create = useCallback(
    (requestText: string, mode: DelegationMode): string => {
      const localId = nextLocalId()
      const session: DelegationSession = {
        localId,
        requestText,
        mode,
        createdAt: Date.now(),
        phase: 'queued',
        events: [],
      }
      setSessions((current) => [session, ...current])

      void (async () => {
        try {
          const response = await fetch('/api/demo/consumer-delegation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestText, serviceMode: mode }),
          })
          if (!response.ok) throw new Error(`启动失败：HTTP ${response.status}`)
          const created = (await response.json()) as TransactionStartResponse
          patchSession(localId, { transactionId: created.transactionId, phase: 'running' })
          connect(localId, created.transactionId, created.eventsUrl)
        } catch (cause) {
          patchSession(localId, {
            phase: 'failed',
            error: cause instanceof Error ? cause.message : String(cause),
          })
        }
      })()

      return localId
    },
    [connect, patchSession],
  )

  const reset = useCallback(() => {
    for (const localId of sourcesRef.current.keys()) closeStream(localId)
    setSessions([])
  }, [closeStream])

  useEffect(() => {
    const sources = sourcesRef.current
    const timers = pollRef.current
    return () => {
      for (const source of sources.values()) source.close()
      for (const timer of timers.values()) window.clearTimeout(timer)
      sources.clear()
      timers.clear()
    }
  }, [])

  return { sessions, create, reset }
}
