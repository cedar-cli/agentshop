/**
 * 组件层共享的展示辅助：名称/颜色映射、格式化、标签文案。
 * 纯展示逻辑，不含业务判断（业务判断在 demo-state.ts）。
 */

import type { EvidenceKind, NewbornEventType, SellerStage } from "../types";

/** 三家卖家的展示名（兜底用；实际优先用场景返回的 displayName）。 */
export const SELLER_FALLBACK_NAME: Record<string, string> = {
  "seller-a": "Seller A",
  "seller-b": "Seller B",
  "seller-c": "Seller C",
};

/**
 * 卖家对应的角色配色 key（用于给不同卖家上不同颜色，避免单一主色）。
 * a=橙、b=蓝、c=绿，与 CSS 中的 .role-a/.role-b/.role-c 对齐。
 */
export function sellerRole(sellerId: string): "a" | "b" | "c" {
  if (sellerId === "seller-a") return "a";
  if (sellerId === "seller-b") return "b";
  return "c";
}

/** 美元金额格式化（整数，无小数）。 */
export function usd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/** 哈希缩略：取前 n 位并加省略号，供 UI 展示（不用于任何校验）。 */
export function shortHash(hash: string, length = 10): string {
  if (!hash) return "—";
  return hash.length <= length ? hash : `${hash.slice(0, length)}…`;
}

/** 证据类别的中文标签。 */
export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  certification: "认证",
  "lab-report": "实验室报告",
  "material-spec": "材料成分",
  photo: "图片",
  attestation: "声明证明",
};

/** 卖家阶段的中文标签。 */
export const STAGE_LABEL: Record<SellerStage, string> = {
  matched: "已匹配",
  "evidence-pending": "询证中",
  scored: "已评分",
  authorized: "已授权",
  rejected: "已淘汰",
};

/** 事件类型的中文短标签（Event Ledger / 进度用）。 */
export const EVENT_LABEL: Record<NewbornEventType, string> = {
  "intent.published": "意图已发布",
  "seller.matched": "卖家匹配",
  "evidence.requested": "发起询证",
  "evidence.submitted": "提交证据",
  "seller.score.updated": "评分更新",
  "order.authorized": "授权下单",
  "receipt.issued": "签发回执",
};

/** 询证问题 id → 简短中文标题（谈判 transcript 展示用）。 */
export const QUESTION_TITLE: Record<string, string> = {
  "q-hypoallergenic-proof": "低敏检测证据",
  "q-delivery-72h": "72 小时配送覆盖",
  "q-return-policy": "皮肤不适退货政策",
  "q-price-premium": "价格溢价说明",
  "q-bundle-offer": "Bundle 组合优惠",
};

/** 把时间戳格式化为 HH:MM:SS（本地时区，24 小时制）。 */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
