/**
 * A2A 实时网络：左侧 Buyer Agent、中间 Event Router、右侧三个 Seller Agent。
 * 节点根据「最新一条事件」的 source / target 高亮，Router 显示累计事件数与传输脉冲。
 */

import { Bot, Radio, Store } from "lucide-react";
import { ACTORS } from "../demo-state";
import type { NewbornEvent } from "../types";
import { SELLER_FALLBACK_NAME, sellerRole } from "./format";

interface A2ANetworkProps {
  // 已到达事件（用于取最新事件判定高亮、统计事件数）
  events: NewbornEvent[];
  // 三家卖家展示名（来自场景）
  sellerNames: Record<string, string>;
  // 是否正在运行（驱动 Router 脉冲动画）
  running: boolean;
}

/**
 * 判定某个参与方 id 是否与最新事件的 source/target 相关（用于高亮）。
 * 卖家节点同时匹配 seller-x 与 seller-agent-seller-x 两种 id 形式。
 */
function isActive(event: NewbornEvent | undefined, actorIds: string[]): boolean {
  if (!event) return false;
  return actorIds.some(
    (id) =>
      event.source === id ||
      event.target === id ||
      // 卖家 Agent 的 source 形如 "seller-agent-seller-c"，需按后缀匹配
      event.source === `seller-agent-${id}`,
  );
}

/**
 * A2A 网络图。
 * @param events 已到达事件
 * @param sellerNames 卖家展示名映射
 * @param running 是否运行中
 */
export function A2ANetwork({ events, sellerNames, running }: A2ANetworkProps) {
  const latest = events.at(-1);
  const buyerActive = isActive(latest, [ACTORS.buyer]);
  const routerActive =
    isActive(latest, [ACTORS.matcher, ACTORS.evaluator, ACTORS.autoPurchase]) ||
    running;

  return (
    <div className={`a2a ${running ? "is-running" : ""}`}>
      <div className="a2a__col a2a__col--buyer">
        <AgentNode
          role="buyer"
          icon={<Bot size={18} />}
          title="Buyer Agent"
          caption="C-Agent"
          active={buyerActive}
        />
      </div>

      <div className="a2a__col a2a__col--router">
        <div className={`a2a-router ${routerActive ? "active" : ""}`}>
          <Radio size={18} />
          <strong>Event Router</strong>
          <span>{events.length} events</span>
        </div>
        <div className={`a2a-beam ${running ? "active" : ""}`} aria-hidden="true" />
      </div>

      <div className="a2a__col a2a__col--sellers">
        {["seller-a", "seller-b", "seller-c"].map((sellerId) => (
          <AgentNode
            key={sellerId}
            role={sellerRole(sellerId)}
            icon={<Store size={16} />}
            title={sellerNames[sellerId] ?? SELLER_FALLBACK_NAME[sellerId]}
            caption={sellerId}
            active={isActive(latest, [sellerId])}
          />
        ))}
      </div>
    </div>
  );
}

interface AgentNodeProps {
  // 角色配色 key（buyer / a / b / c）
  role: "buyer" | "a" | "b" | "c";
  // 图标
  icon: React.ReactNode;
  // 标题
  title: string;
  // 副标题
  caption: string;
  // 是否高亮
  active: boolean;
}

/** 单个 Agent 节点。 */
function AgentNode({ role, icon, title, caption, active }: AgentNodeProps) {
  return (
    <div className={`a2a-node role-${role} ${active ? "active" : ""}`}>
      <div className="a2a-node__avatar">{icon}</div>
      <div className="a2a-node__copy">
        <strong>{title}</strong>
        <small>{caption}</small>
      </div>
      <span className="a2a-node__signal" aria-hidden="true" />
    </div>
  );
}
