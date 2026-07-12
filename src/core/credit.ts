/* 信用计算：六维聚合、偏好加权、买家权重、颜色映射 */

import type { Agent, CreditVector, Preference } from "./types";

export const vectorAvg = (v: CreditVector): number =>
  (v.timeliness +
    v.spec +
    v.afterSales +
    v.compensation +
    v.priceStability +
    v.packaging) /
  6;

/**
 * 依买家偏好，对某卖家提案计算匹配分（0-100）。
 * 价格越低越好（相对预算），信用维度按偏好加权。
 * 呼应 §3.4：不同买家对同一家店评价完全不同。
 */
export function matchScore(
  seller: Agent,
  price: number,
  maxPrice: number,
  promisedDays: number,
  pref: Preference,
): number {
  const wSum = pref.timeliness + pref.spec + pref.price + pref.afterSales || 1;
  // 价格竞争力：低于预算越多分越高
  const priceEdge = clamp01((maxPrice - price) / maxPrice + 0.5) * 100;
  // 时效：承诺天数越短越好（以 7 天为基准归一）
  const timeScore = clamp01(1 - (promisedDays - 1) / 7) * 100;
  const v = seller.vector;
  const raw =
    (pref.timeliness * (v.timeliness * 0.5 + timeScore * 0.5) +
      pref.spec * v.spec +
      pref.price * priceEdge +
      pref.afterSales * v.afterSales) /
    wSum;
  // 违约/风控卖家匹配分归零（源头拦截，§4.3①）
  if (seller.flagged) return 0;
  return Math.round(raw);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * 买家出具鉴证的权重（§3.3 权重机制）：
 * 高信用买家 3-5 倍；低信用大幅削弱；专业鉴证 Agent 最高。
 */
export function buyerWeight(
  buyerCredit: number,
  professional: boolean,
): number {
  if (professional) return 100; // 一份专业检测抵上百份
  if (buyerCredit >= 85) return 4.5;
  if (buyerCredit >= 70) return 2.2;
  if (buyerCredit >= 50) return 1;
  if (buyerCredit >= 30) return 0.3;
  return 0.05; // 低信用小号几乎不计入
}

/** 信用分 → 语义色 */
export function creditColor(credit: number): string {
  if (credit >= 80) return "var(--color-fulfil)";
  if (credit >= 60) return "var(--color-data)";
  if (credit >= 40) return "var(--color-proposal)";
  return "var(--color-breach)";
}

/** 角色 → 色 */
export function roleColor(role: Agent["role"]): string {
  switch (role) {
    case "consumer":
      return "var(--color-consumer)";
    case "seller":
      return "var(--color-seller)";
    case "supply":
      return "var(--color-supply)";
    case "factory":
      return "var(--color-factory)";
  }
}
