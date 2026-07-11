import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  StoredEvent,
  TransactionSnapshot,
  TransactionStartResponse,
} from './types'

export type LivePhase = 'idle' | 'queued' | 'running' | 'completed' | 'failed'

interface StartOptions {
  endpoint: string
  body?: unknown
}

export function useTransactionStream(
  eventTypes: readonly string[],
  terminalEvent: string,
) {
  const [phase, setPhase] = useState<LivePhase>('idle')
  const [events, setEvents] = useState<StoredEvent[]>([])
  const [transactionId, setTransactionId] = useState<string>()
  const [chainValid, setChainValid] = useState<boolean>()
  const [error, setError] = useState<string>()
  const sourceRef = useRef<EventSource>()
  const transactionRef = useRef<string>()
  const pollRef = useRef<number>()

  const stop = useCallback(() => {
    sourceRef.current?.close()
    sourceRef.current = undefined
    if (pollRef.current !== undefined) {
      window.clearTimeout(pollRef.current)
      pollRef.current = undefined
    }
  }, [])

  const mergeEvent = useCallback((incoming: StoredEvent) => {
    setEvents((current) => {
      if (current.some((event) => event.id === incoming.id)) return current
      return [...current, incoming].sort((a, b) => a.sequence - b.sequence)
    })
  }, [])

  const loadSnapshot = useCallback(async (id: string) => {
    const response = await fetch(`/api/transactions/${id}`)
    if (!response.ok) return undefined
    const snapshot = (await response.json()) as TransactionSnapshot
    if (transactionRef.current !== id) return undefined
    setEvents(snapshot.events)
    setChainValid(snapshot.chainValid)
    if (snapshot.status === 'completed') setPhase('completed')
    if (snapshot.status === 'failed') {
      setPhase('failed')
      setError(snapshot.error ?? '交易执行失败')
    }
    return snapshot
  }, [])

  const pollUntilSettled = useCallback(
    (id: string) => {
      const poll = async () => {
        if (transactionRef.current !== id) return
        try {
          const snapshot = await loadSnapshot(id)
          if (snapshot?.status === 'completed' || snapshot?.status === 'failed') return
        } catch {
          // 下一轮继续尝试，现场网络抖动不应中断交易展示。
        }
        pollRef.current = window.setTimeout(() => void poll(), 350)
      }
      void poll()
    },
    [loadSnapshot],
  )

  const connect = useCallback(
    (id: string, eventsUrl: string) => {
      const source = new EventSource(eventsUrl)
      sourceRef.current = source
      for (const eventType of eventTypes) {
        source.addEventListener(eventType, (message) => {
          if (transactionRef.current !== id) return
          const event = JSON.parse((message as MessageEvent<string>).data) as StoredEvent
          mergeEvent(event)
          setPhase(event.type === terminalEvent ? 'completed' : 'running')
          if (event.type === terminalEvent) {
            source.close()
            sourceRef.current = undefined
            void loadSnapshot(id)
          }
        })
      }
      source.onerror = () => {
        if (transactionRef.current !== id) return
        source.close()
        sourceRef.current = undefined
        pollUntilSettled(id)
      }
    },
    [eventTypes, loadSnapshot, mergeEvent, pollUntilSettled, terminalEvent],
  )

  const start = useCallback(
    ({ endpoint, body }: StartOptions) => {
      stop()
      setEvents([])
      setChainValid(undefined)
      setError(undefined)
      setPhase('queued')
      setTransactionId(undefined)
      transactionRef.current = undefined

      void (async () => {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            ...(body === undefined
              ? {}
              : {
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                }),
          })
          if (!response.ok) throw new Error(`启动失败：HTTP ${response.status}`)
          const created = (await response.json()) as TransactionStartResponse
          transactionRef.current = created.transactionId
          setTransactionId(created.transactionId)
          setPhase('running')
          connect(created.transactionId, created.eventsUrl)
        } catch (cause) {
          setPhase('failed')
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })()
    },
    [connect, stop],
  )

  const reset = useCallback(() => {
    stop()
    transactionRef.current = undefined
    setPhase('idle')
    setEvents([])
    setTransactionId(undefined)
    setChainValid(undefined)
    setError(undefined)
  }, [stop])

  useEffect(() => stop, [stop])

  return { phase, events, transactionId, chainValid, error, start, reset }
}
