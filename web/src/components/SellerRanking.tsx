/**
 * 卖家排名与评分表（第二幕初始排名 → 第三幕验证后翻转）。
 *
 * 行按卖家固定顺序（A/B/C）渲染，靠 CSS transform 平移到各自的当前排名位置，
 * 从而在排名变化时产生「平滑上下移动」的克制动画，且容器总高度恒定、不跳动。
 * 排名完全来自真实 seller.score.updated 事件，绝不在固定时间后写死。
 */

import { ArrowUpRight, Crown } from "lucide-react";
import { ranking, type SellerRanking as RankingRow } from "../demo-state";
import type { NewbornEvent } from "../types";
import { SELLER_FALLBACK_NAME, STAGE_LABEL, sellerRole } from "./format";

interface SellerRankingProps {
  // 已到达事件
  events: NewbornEvent[];
  // 卖家展示名映射
  sellerNames: Record<string, string>;
}

// 单行高度（含行间距），用于按排名计算 transform 偏移，保持与 CSS 同步
const ROW_HEIGHT = 88;

/**
 * 排名评分表。
 * @param events 已到达事件
 * @param sellerNames 卖家展示名
 */
export function SellerRanking({ events, sellerNames }: SellerRankingProps) {
  const rows = ranking(events);
  // 建立 sellerId → 当前排名位次（0 起）的映射，用于计算每行的 Y 平移
  const positionBySeller = new Map<string, number>();
  rows.forEach((row, index) => positionBySeller.set(row.sellerId, index));

  return (
    <div className="rank-panel">
      <div className="rank-head" role="row">
        <span>Seller</span>
        <span>Match</span>
        <span>Trust</span>
        <span>Delivery</span>
        <span>Price</span>
        <span>Risk</span>
        <span>Total</span>
        <span>Rank</span>
        <span>Stage</span>
      </div>

      <div
        className="rank-body"
        style={{ height: `${rows.length * ROW_HEIGHT}px` }}
      >
        {/* 按固定顺序 A/B/C 渲染，靠 transform 移动到排名位次，保证平滑动画 */}
        {["seller-a", "seller-b", "seller-c"].map((sellerId) => {
          const row = rows.find((item) => item.sellerId === sellerId);
          const position = positionBySeller.get(sellerId) ?? 0;
          return (
            <RankRow
              key={sellerId}
              sellerId={sellerId}
              name={sellerNames[sellerId] ?? SELLER_FALLBACK_NAME[sellerId]}
              row={row}
              offsetY={position * ROW_HEIGHT}
              order={position}
            />
          );
        })}
      </div>
    </div>
  );
}

interface RankRowProps {
  sellerId: string;
  name: string;
  row: RankingRow | undefined;
  offsetY: number;
  // 排名位次（0 起），窄屏用作 CSS order，宽屏用 offsetY 做 transform 平移
  order: number;
}

/** 单行卖家评分。评分尚未到达时展示占位 "—"。 */
function RankRow({ sellerId, name, row, offsetY, order }: RankRowProps) {
  const score = row?.score;
  const rejected = row?.rejected ?? false;
  const verified = row?.verified ?? false;
  const isWinner = verified && !rejected && score?.stage === "authorized";

  return (
    <div
      className={`rank-row role-${sellerRole(sellerId)} ${
        rejected ? "rejected" : ""
      } ${isWinner ? "winner" : ""}`}
      style={
        {
          transform: `translateY(${offsetY}px)`,
          "--order": order,
        } as React.CSSProperties
      }
      role="row"
    >
      <span className="rank-row__seller">
        <i className={`role-dot role-${sellerRole(sellerId)}`} aria-hidden="true" />
        <strong>{name}</strong>
        {isWinner && <Crown size={13} className="ic ic--green" />}
      </span>
      <Metric value={score?.matchScore} />
      <Metric value={score?.trustScore} />
      <Metric value={score?.deliveryConfidence} />
      <Metric value={score?.priceFit} />
      {/* 风险分是 0-1，单独格式化，越低越好 */}
      <span className="rank-cell">
        {score ? score.riskScore.toFixed(2) : "—"}
      </span>
      <span className="rank-cell rank-cell--total">
        {score ? score.totalScore : "—"}
      </span>
      <span className="rank-cell rank-cell--rank">
        {score ? (
          <>
            #{score.rank}
            {verified && score.rank === 1 && (
              <ArrowUpRight size={12} className="ic ic--green" />
            )}
          </>
        ) : (
          "—"
        )}
      </span>
      <span className={`rank-cell rank-stage stage-${score?.stage ?? "pending"}`}>
        {score ? STAGE_LABEL[score.stage] : "待评分"}
      </span>
    </div>
  );
}

/** 单个 0-100 评分格（无值显示占位）。 */
function Metric({ value }: { value: number | undefined }) {
  return <span className="rank-cell">{value ?? "—"}</span>;
}
