/**
 * 第四幕 · Agent 授权决策（Agent Order）
 * 来自真实 order.authorized 事件，展示最终选择的卖家、金额与理由。
 */

import { CheckCircle2, Gavel } from "lucide-react";
import type { NewbornEvent, OrderAuthorized } from "../types";
import { SELLER_FALLBACK_NAME, sellerRole, usd } from "./format";

interface AgentOrderProps {
  // 授权 payload（未授权则不渲染实体）
  authorization: OrderAuthorized | undefined;
  // 卖家展示名映射
  sellerNames: Record<string, string>;
}

/** 决策理由固定文案（体现"最佳可验证安全 + 交付信心 + 可接受价格"）。 */
const DECISION_REASON =
  "Best verified safety + delivery confidence + acceptable price";

/**
 * Agent 授权决策卡。
 * @param authorization 授权数据
 * @param sellerNames 卖家展示名
 */
export function AgentOrder({ authorization, sellerNames }: AgentOrderProps) {
  if (!authorization) {
    return (
      <div className="agent-order agent-order--empty">
        <Gavel size={20} />
        <span>等待自动购买决策</span>
      </div>
    );
  }

  const name =
    sellerNames[authorization.sellerId] ??
    SELLER_FALLBACK_NAME[authorization.sellerId];

  return (
    <div className={`agent-order role-${sellerRole(authorization.sellerId)}`}>
      <div className="agent-order__head">
        <CheckCircle2 size={16} className="ic ic--green" />
        <span>Selected</span>
        <strong>{name}</strong>
        {authorization.autoApproved && (
          <span className="tag tag--auto">Auto-approved</span>
        )}
      </div>

      <p className="agent-order__reason">
        <span>Reason</span>
        {DECISION_REASON}
      </p>

      <div className="agent-order__amount">
        <span>授权金额</span>
        <strong>{usd(authorization.authorizedAmountUsd)}</strong>
      </div>
    </div>
  );
}
