/* ============================================================
   反事实推演 · 「假设时间机器」核心打分
   同一批 offer，随偏好权重变化实时重排 —— 证明 C-Agent 为你求解，
   而非给你推销。纯函数，可复现、可单测。
   ============================================================ */

import type { DemoOffer, OfferPreference } from '../demo/demoData'

export interface RankedOffer {
  offer: DemoOffer
  score: number
  rank: number
}

/** 依偏好对单个 offer 计算匹配分（0-100，四维硬指标加权平均） */
export function scoreOffer(offer: DemoOffer, pref: OfferPreference): number {
  const wSum = pref.timeliness + pref.spec + pref.price + pref.afterSales || 1
  const m = offer.metrics
  const raw =
    (pref.timeliness * m.timeliness +
      pref.spec * m.spec +
      pref.price * m.price +
      pref.afterSales * m.afterSales) /
    wSum
  return Math.round(raw)
}

/** 依偏好对一组 offer 实时重排，分数相同按信用兜底 */
export function rankOffers(
  offers: DemoOffer[],
  pref: OfferPreference,
): RankedOffer[] {
  return offers
    .map((offer) => ({ offer, score: scoreOffer(offer, pref), rank: 0 }))
    .sort((a, b) => b.score - a.score || b.offer.credit - a.offer.credit)
    .map((ranked, index) => ({ ...ranked, rank: index + 1 }))
}

/** 当前偏好下的冠军 offer */
export function championOf(
  offers: DemoOffer[],
  pref: OfferPreference,
): DemoOffer | null {
  const ranked = rankOffers(offers, pref)
  return ranked.length ? ranked[0].offer : null
}

export const PREF_DIMS: Array<{
  key: keyof OfferPreference
  label: string
  color: string
}> = [
  { key: 'timeliness', label: '时效', color: 'var(--color-data)' },
  { key: 'spec', label: '品质', color: 'var(--color-verify)' },
  { key: 'price', label: '价格', color: 'var(--color-fulfil)' },
  { key: 'afterSales', label: '售后', color: 'var(--color-proposal)' },
]
