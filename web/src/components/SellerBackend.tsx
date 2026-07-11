/**
 * Seller C Backend · 右侧后台叙事面板
 *
 * 随真实事件推进依次显示：
 *  - 第二幕：New high-value intent detected（收到高价值意图）
 *  - 第三幕：Trust Score 上升、Rank 从 #3 移动到 #1
 *  - 第四幕：Intent Rank WON、Agent Order Created
 * 全部由 demo-state 从真实事件推导，不写死时序。
 */

import { PackageCheck, Radar, TrendingUp, Trophy } from "lucide-react";
import {
  authorization,
  isVerified,
  matchedSeller,
  postVerificationScore,
  preVerificationScore,
} from "../demo-state";
import type { NewbornEvent } from "../types";
import { SELLER_FALLBACK_NAME } from "./format";

interface SellerBackendProps {
  // 已到达事件
  events: NewbornEvent[];
  // 卖家展示名映射
  sellerNames: Record<string, string>;
  // 聚焦卖家（默认 seller-c）
  focusSellerId?: string;
}

/**
 * Seller C 后台面板。
 * @param events 已到达事件
 * @param sellerNames 卖家展示名
 * @param focusSellerId 聚焦卖家
 */
export function SellerBackend({
  events,
  sellerNames,
  focusSellerId = "seller-c",
}: SellerBackendProps) {
  const name = sellerNames[focusSellerId] ?? SELLER_FALLBACK_NAME[focusSellerId];
  const matched = matchedSeller(events, focusSellerId) !== undefined;
  const pre = preVerificationScore(events, focusSellerId);
  const post = postVerificationScore(events, focusSellerId);
  const verified = isVerified(events, focusSellerId);
  const auth = authorization(events);
  const won = auth?.sellerId === focusSellerId;

  return (
    <div className="seller-backend">
      <div className="seller-backend__head">
        <span className="tag tag--c">{name} · Backend</span>
      </div>

      <ul className="backend-feed">
        {!matched && (
          <BackendItem
            on={false}
            icon={<Radar size={13} />}
            tone="blue"
            text="Listening for qualified intents"
          />
        )}

        {/* 第二幕：检测到高价值意图，匹配前不提前显示 */}
        {matched && (
          <BackendItem
            on
            icon={<Radar size={13} />}
            tone="blue"
            text="New high-value intent detected"
          />
        )}

        {/* 第三幕：Trust 上升、Rank 移动 */}
        {pre && post && (
          <BackendItem
            on={verified}
            icon={<TrendingUp size={13} />}
            tone="green"
            text={`Trust ${pre.trustScore} → ${post.trustScore}，Rank #${pre.rank} → #${post.rank}`}
          />
        )}

        {/* 第四幕：赢得意图、创建订单 */}
        {won && (
          <>
            <BackendItem
              on
              icon={<Trophy size={13} />}
              tone="yellow"
              text="Intent Rank: WON"
              emphasis
            />
            <BackendItem
              on
              icon={<PackageCheck size={13} />}
              tone="green"
              text="Agent Order Created"
            />
          </>
        )}
      </ul>
    </div>
  );
}

interface BackendItemProps {
  // 是否已触发（未触发显示为待命灰态）
  on: boolean;
  icon: React.ReactNode;
  // 配色 tone
  tone: "blue" | "green" | "yellow";
  text: string;
  // 是否强调（赢得意图）
  emphasis?: boolean;
}

/** 后台单条动态。 */
function BackendItem({ on, icon, tone, text, emphasis }: BackendItemProps) {
  return (
    <li
      className={`backend-item tone-${tone} ${on ? "on" : "off"} ${
        emphasis ? "emphasis" : ""
      }`}
    >
      <span className="backend-item__dot">{icon}</span>
      <span className="backend-item__text">{text}</span>
    </li>
  );
}
