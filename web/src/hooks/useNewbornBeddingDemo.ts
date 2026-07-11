/**
 * useNewbornBeddingDemo · 新生儿床品实时 Demo 的状态与生命周期 Hook
 *
 * 本 Hook 是前端与真实后端的唯一交互入口，负责：
 *  1. 场景加载：GET /api/demo/newborn-bedding（意图 + 三家卖家基础信息）。
 *  2. 启动交易：POST /api/demo/newborn-bedding，拿到 transactionId 与 eventsUrl。
 *  3. SSE 生命周期：用 EventSource 订阅真实事件，逐条驱动剧情。
 *  4. 事件合并去重：按 id / sequence 双重去重并按 sequence 排序（复用 demo-state 纯函数）。
 *  5. 快照回退：SSE 断开时用 transactionUrl 拉一次快照补全。
 *  6. 收尾：收到 receipt.issued 后关闭 EventSource，再加载一次最终快照（拿 chainValid）。
 *  7. reset / replay：重播时关闭旧连接、清空旧交易状态、创建全新交易。
 *
 * 关键纪律：
 *  - 绝不用前端定时器伪造事件；所有事件都来自真实 SSE 或真实快照。
 *  - 18 个事件不预先写死；前端只被动接收并渲染。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeEvent, mergeEvents } from "../demo-state";
import type {
  DemoStartResponse,
  NewbornBeddingScenario,
  NewbornEvent,
  NewbornEventType,
  TransactionSnapshot,
  TransactionStatus,
} from "../types";

/** 本 Demo 需要订阅的 7 类事件类型（EventSource 按具名事件监听）。 */
const SUBSCRIBED_EVENT_TYPES: NewbornEventType[] = [
  "intent.published",
  "seller.matched",
  "evidence.requested",
  "evidence.submitted",
  "seller.score.updated",
  "order.authorized",
  "receipt.issued",
];

/**
 * Demo 的整体运行阶段（供 UI 决定主按钮、状态条等）。
 *  - loading：场景加载中
 *  - offline：后端不可用（Router offline）
 *  - idle：场景就绪、等待用户发布意图
 *  - queued：已 POST，交易排队中
 *  - running：SSE 已连接、事件推进中
 *  - completed：收到回执、交易闭环
 *  - failed：交易失败或网络错误
 */
export type DemoPhase =
  | "loading"
  | "offline"
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed";

/** Hook 对外暴露的完整状态与操作。 */
export interface NewbornBeddingDemo {
  // 当前运行阶段
  phase: DemoPhase;
  // 静态场景（意图 + 卖家基础信息）；加载完成前为 undefined
  scenario: NewbornBeddingScenario | undefined;
  // 已到达并去重排序后的事件列表
  events: NewbornEvent[];
  // 当前交易 id（未启动为 undefined）
  transactionId: string | undefined;
  // 哈希链是否校验通过（来自最终快照；未知为 undefined）
  chainValid: boolean | undefined;
  // 错误信息（仅出错时存在）
  error: string | undefined;
  // SSE 当前是否已断开并回退到快照（用于 UI 提示"已切换快照"）
  usedSnapshotFallback: boolean;
  // 发布意图 / 启动交易
  start: () => void;
  // 重播：清空旧交易并重新启动一笔全新交易
  replay: () => void;
  // 重置到 idle（不启动）
  reset: () => void;
}

/**
 * 新生儿床品实时 Demo Hook。
 * @returns Demo 的状态与操作集合
 */
export function useNewbornBeddingDemo(): NewbornBeddingDemo {
  const [phase, setPhase] = useState<DemoPhase>("loading");
  const [scenario, setScenario] = useState<NewbornBeddingScenario>();
  const [events, setEvents] = useState<NewbornEvent[]>([]);
  const [transactionId, setTransactionId] = useState<string>();
  const [chainValid, setChainValid] = useState<boolean>();
  const [error, setError] = useState<string>();
  const [usedSnapshotFallback, setUsedSnapshotFallback] = useState(false);

  // 当前 EventSource 引用；切换/收尾时用于关闭旧连接
  const sourceRef = useRef<EventSource | undefined>(undefined);
  // 当前交易 id 的 ref 镜像：SSE 回调是闭包，需用 ref 读到"最新"交易 id，避免串单
  const transactionRef = useRef<string | undefined>(undefined);
  // 是否已完成收尾：防止 onerror 与收尾快照竞争、重复加载
  const settledRef = useRef(false);
  // SSE 断线后的快照轮询定时器；reset/replay/unmount 时必须清理
  const fallbackTimerRef = useRef<number | undefined>(undefined);

  /** 关闭当前 EventSource（幂等）。 */
  const closeSource = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = undefined;
  }, []);

  /** 停止当前快照轮询（幂等）。 */
  const stopFallbackPolling = useCallback(() => {
    if (fallbackTimerRef.current !== undefined) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = undefined;
    }
  }, []);

  /**
   * 加载一次交易快照（GET transactionUrl），把事件整表并入并更新状态。
   * 用于 SSE 断开回退与收尾补全；只接受"仍是当前交易"的快照，避免串单。
   * @param id 目标交易 id
   * @param options.fallback 是否标记为"回退快照"（用于 UI 提示）
   */
  const loadSnapshot = useCallback(
    async (
      id: string,
      options: { fallback?: boolean } = {},
    ): Promise<TransactionSnapshot | undefined> => {
      try {
        const response = await fetch(`/api/transactions/${id}`);
        if (!response.ok) return undefined;
        const snapshot = (await response.json()) as TransactionSnapshot;
        // 快照回来时如果已切换到别的交易，直接丢弃，绝不污染新交易
        if (transactionRef.current !== id) return undefined;

        setEvents((current) => mergeEvents(current, snapshot.events));
        setChainValid(snapshot.chainValid);
        if (options.fallback) setUsedSnapshotFallback(true);
        if (snapshot.status === "failed") {
          setPhase("failed");
          if (snapshot.error) setError(snapshot.error);
        } else if (snapshot.status === "completed") {
          setPhase("completed");
        }
        return snapshot;
      } catch {
        return undefined;
      }
    },
    [],
  );

  /**
   * SSE 断线后的可靠回退：持续轮询交易快照，直到 completed/failed。
   * 每次轮询都会合并真实后端事件；不会在前端生成任何伪事件。
   */
  const pollSnapshotUntilSettled = useCallback(
    (id: string): void => {
      stopFallbackPolling();

      const poll = async (): Promise<void> => {
        if (transactionRef.current !== id || settledRef.current) return;

        const snapshot = await loadSnapshot(id, { fallback: true });
        if (transactionRef.current !== id || settledRef.current) return;

        if (snapshot?.status === "completed" || snapshot?.status === "failed") {
          settledRef.current = true;
          stopFallbackPolling();
          return;
        }

        fallbackTimerRef.current = window.setTimeout(() => {
          void poll();
        }, 300);
      };

      void poll();
    },
    [loadSnapshot, stopFallbackPolling],
  );

  /**
   * 建立 EventSource 并订阅 7 类事件，逐条合并去重、推进阶段。
   * 收到 receipt.issued 后收尾：关闭连接并加载最终快照。
   * @param id 交易 id
   * @param eventsUrl SSE 事件流地址
   */
  const connect = useCallback(
    (id: string, eventsUrl: string): void => {
      closeSource();
      settledRef.current = false;
      const source = new EventSource(eventsUrl);
      sourceRef.current = source;

      for (const eventType of SUBSCRIBED_EVENT_TYPES) {
        source.addEventListener(eventType, (message) => {
          // 只处理仍属于当前交易的消息
          if (transactionRef.current !== id) return;
          const event = JSON.parse(
            (message as MessageEvent<string>).data,
          ) as NewbornEvent;

          setEvents((current) => mergeEvent(current, event));
          setPhase((prev) => (prev === "completed" ? prev : "running"));

          // 回执到达 = 交易闭环：关闭 SSE，再拉一次最终快照拿 chainValid
          if (event.type === "receipt.issued" && !settledRef.current) {
            settledRef.current = true;
            stopFallbackPolling();
            closeSource();
            void loadSnapshot(id);
            setPhase("completed");
          }
        });
      }

      // SSE 出错（含正常关闭触发的 error）：若尚未收尾，回退到快照补全
      source.onerror = () => {
        if (settledRef.current) return;
        if (transactionRef.current !== id) return;
        closeSource();
        pollSnapshotUntilSettled(id);
      };
    },
    [closeSource, loadSnapshot, pollSnapshotUntilSettled, stopFallbackPolling],
  );

  /**
   * 启动一笔新交易：POST /api/demo/newborn-bedding，随后连接 SSE。
   * 每次调用都会先清空旧交易状态、关闭旧连接，保证不串单、可重复。
   */
  const start = useCallback((): void => {
    closeSource();
    stopFallbackPolling();
    settledRef.current = false;
    setEvents([]);
    setChainValid(undefined);
    setError(undefined);
    setUsedSnapshotFallback(false);
    setPhase("queued");
    // 先清空交易 ref/state，避免旧交易的 SSE 回调误判为当前交易
    transactionRef.current = undefined;
    setTransactionId(undefined);

    void (async () => {
      try {
        const response = await fetch("/api/demo/newborn-bedding", {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error(`启动 Demo 失败：HTTP ${response.status}`);
        }
        const created = (await response.json()) as DemoStartResponse;
        transactionRef.current = created.transactionId;
        setTransactionId(created.transactionId);
        setPhase("running");
        connect(created.transactionId, created.eventsUrl);
      } catch (cause) {
        setPhase("failed");
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, [closeSource, connect, stopFallbackPolling]);

  /** 重播：语义等同于重新 start（内部已清空旧交易并创建新交易）。 */
  const replay = useCallback((): void => {
    start();
  }, [start]);

  /** 重置到 idle：关闭连接、清空全部交易状态，但保留已加载的场景。 */
  const reset = useCallback((): void => {
    closeSource();
    stopFallbackPolling();
    settledRef.current = false;
    transactionRef.current = undefined;
    setTransactionId(undefined);
    setEvents([]);
    setChainValid(undefined);
    setError(undefined);
    setUsedSnapshotFallback(false);
    setPhase(scenario ? "idle" : "loading");
  }, [closeSource, scenario, stopFallbackPolling]);

  // 初次挂载：加载静态场景。加载成功进入 idle；失败标记 offline。
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/demo/newborn-bedding");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as NewbornBeddingScenario;
        if (cancelled) return;
        setScenario(data);
        setPhase("idle");
      } catch {
        if (cancelled) return;
        setPhase("offline");
      }
    })();

    // 卸载时取消并关闭连接，避免内存泄漏与串单
    return () => {
      cancelled = true;
      if (fallbackTimerRef.current !== undefined) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = undefined;
      }
      sourceRef.current?.close();
      sourceRef.current = undefined;
    };
  }, []);

  return {
    phase,
    scenario,
    events,
    transactionId,
    chainValid,
    error,
    usedSnapshotFallback,
    start,
    replay,
    reset,
  };
}

/** 便于外部按状态映射时复用的交易状态类型（re-export）。 */
export type { TransactionStatus };
