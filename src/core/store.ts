/* ============================================================
   Zustand 世界 store · 三视图唯一数据源
   持有 tick 循环、时钟控制、消费者/商家交互动作、风控注入
   ============================================================ */

import { create } from "zustand";
import { createWorld } from "./world";
import { step, emitDemand } from "./engine";
import { vectorAvg } from "./credit";
import type {
  Category,
  CreditVector,
  InboxMode,
  Preference,
  RiskEvent,
  RiskKind,
  WorldState,
} from "./types";

const ATT_CAP = 60; // 交易信任流保留上限
const RISK_DETECT_TICKS = 3; // 刷分注入后被信用链识别的延迟

interface Actions {
  tickOnce: () => void;
  toggleRun: () => void;
  setSpeed: (s: number) => void;
  reset: () => void;
  setPreference: (p: Partial<Preference>) => void;
  setInbox: (mode: InboxMode, category?: Category | null) => void;
  publishDemand: (
    category: Category,
    maxPrice: number,
    withinDays: number,
    qty: number,
  ) => void;
  triggerScene: (id: string) => void;
  toggleScene: (id: string) => void;
  injectRisk: (kind: RiskKind, targetId: string) => void;
}

export type Store = WorldState & Actions;

let uidn = 0;
const rid = () => `risk-${(++uidn).toString(36)}`;

export const useWorld = create<Store>((set, get) => ({
  ...createWorld(),

  tickOnce: () => {
    const w = get();
    const { agents, transactions, newAttestations } = step(w);

    // 风控识别：注入满 RISK_DETECT_TICKS 后处置目标
    let riskEvents = w.riskEvents;
    const nextTick = w.tick + 1;
    const pending = riskEvents.filter(
      (r) => !r.resolved && nextTick - r.tick >= RISK_DETECT_TICKS,
    );
    if (pending.length) {
      riskEvents = riskEvents.map((r) =>
        pending.includes(r) ? { ...r, resolved: true } : r,
      );
      for (const r of pending) {
        const a = agents[r.targetId];
        if (a) {
          const drop: CreditVector = {
            timeliness: Math.max(5, a.vector.timeliness - 30),
            spec: Math.max(5, a.vector.spec - 35),
            afterSales: Math.max(5, a.vector.afterSales - 25),
            compensation: Math.max(5, a.vector.compensation - 25),
            priceStability: Math.max(5, a.vector.priceStability - 20),
            packaging: Math.max(5, a.vector.packaging - 20),
          };
          agents[r.targetId] = {
            ...a,
            flagged: true,
            vector: drop,
            credit: Math.round(vectorAvg(drop)),
          };
        }
      }
    }

    set({
      tick: nextTick,
      agents,
      transactions,
      attestations: [...newAttestations.reverse(), ...w.attestations].slice(
        0,
        ATT_CAP,
      ),
      riskEvents: riskEvents.slice(-30),
      activeScenes: w.activeScenes.map((s) =>
        s.armed && !s.triggered
          ? { ...s, progress: Math.min(100, s.progress + Math.random() * 3) }
          : s,
      ),
    });
  },

  toggleRun: () => set((s) => ({ running: !s.running })),
  setSpeed: (speed) => set({ speed }),
  reset: () => {
    uidn = 0;
    set({ ...createWorld(Math.floor(Math.random() * 1e9)) });
  },

  setPreference: (p) => set((s) => ({ preference: { ...s.preference, ...p } })),

  setInbox: (mode, category = null) =>
    set({ inbox: mode, inboxCategory: category }),

  publishDemand: (category, maxPrice, withinDays, qty) => {
    const w = get();
    const tx = emitDemand(w, category, maxPrice, withinDays, qty);
    set({ transactions: [tx, ...w.transactions] });
  },

  triggerScene: (id) =>
    set((s) => ({
      activeScenes: s.activeScenes.map((sc) =>
        sc.id === id ? { ...sc, triggered: true, progress: 100 } : sc,
      ),
    })),

  toggleScene: (id) =>
    set((s) => ({
      activeScenes: s.activeScenes.map((sc) =>
        sc.id === id ? { ...sc, armed: !sc.armed } : sc,
      ),
    })),

  injectRisk: (kind, targetId) => {
    const w = get();
    const a = w.agents[targetId];
    if (!a) return;
    const msg =
      kind === "brush"
        ? `${a.name} 注入刷分小号 · 信用链校验中…`
        : kind === "fake-tx"
          ? `${a.name} 伪造交易记录 · 多节点交叉核验中…`
          : `${a.name} 违约未赔付 · 触发风控降级`;
    const ev: RiskEvent = {
      id: rid(),
      kind,
      targetId,
      targetName: a.name,
      tick: w.tick,
      message: msg,
      resolved: kind === "breach", // 违约即时处置；刷分/伪造需校验延迟
    };
    // 违约即时降级
    const agents = { ...w.agents };
    if (kind === "breach") {
      const drop: CreditVector = {
        ...a.vector,
        compensation: Math.max(5, a.vector.compensation - 40),
        timeliness: Math.max(5, a.vector.timeliness - 20),
      };
      agents[targetId] = {
        ...a,
        flagged: true,
        vector: drop,
        credit: Math.round(vectorAvg(drop)),
      };
    }
    set({ agents, riskEvents: [...w.riskEvents, ev] });
  },
}));

/** 启动全局 tick 循环（在 App 挂载时调用一次） */
export function startClock(): () => void {
  let raf = 0;
  let acc = 0;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    const s = useWorld.getState();
    if (s.running) {
      acc += dt * s.speed;
      const period = 900; // 基础 tick 周期 ms
      while (acc >= period) {
        acc -= period;
        useWorld.getState().tickOnce();
      }
    } else {
      acc = 0;
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
