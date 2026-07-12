import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { DemoPurchase, OfferMetrics, OfferPreference } from '../../demo/demoData'
import { PREF_DIMS, rankOffers } from '../../lib/counterfactual'
import { yuan } from '../../lib/format'
import { openImageLightbox } from '../shared/ImageLightbox'

const PRESETS: Array<{ label: string; pref: OfferPreference }> = [
  { label: '最看重价格', pref: { timeliness: 10, spec: 10, price: 70, afterSales: 10 } },
  { label: '最看重时效', pref: { timeliness: 70, spec: 10, price: 10, afterSales: 10 } },
  { label: '最看重品质', pref: { timeliness: 10, spec: 70, price: 10, afterSales: 10 } },
  { label: '最看重售后', pref: { timeliness: 10, spec: 10, price: 10, afterSales: 70 } },
]

const METRIC_DIMS: Array<{ key: keyof OfferMetrics; label: string; color: string }> = [
  { key: 'timeliness', label: '时效', color: 'var(--color-data)' },
  { key: 'spec', label: '品质', color: 'var(--color-verify)' },
  { key: 'afterSales', label: '售后', color: 'var(--color-proposal)' },
  { key: 'price', label: '划算', color: 'var(--color-fulfil)' },
]

/**
 * 假设时间机器：对一笔历史购买，拖动偏好即可让决策实时重算。
 * 证明 C-Agent 是在为买家「求解」，而非推销既定答案。
 */
export function CounterfactualPanel({ purchase }: { purchase: DemoPurchase }) {
  const [pref, setPref] = useState<OfferPreference>(purchase.baselinePref)

  useEffect(() => {
    setPref(purchase.baselinePref)
  }, [purchase.id, purchase.baselinePref])

  const ranked = rankOffers(purchase.offers, pref)
  const currentChampion = ranked[0]?.offer ?? null
  const baselineChampion = purchase.offers.find((offer) => offer.selected) ?? null
  const switched =
    !!currentChampion &&
    !!baselineChampion &&
    currentChampion.seller !== baselineChampion.seller

  const total = pref.timeliness + pref.spec + pref.price + pref.afterSales || 1

  return (
    <div className="inspector-block cf-block">
      <div className="inspector-title-row">
        <span className="eyebrow">假设时间机器 · 反事实推演</span>
        <span className="num">{purchase.offers.length} 个可信提案</span>
      </div>
      <p className="cf-lead">
        同一批 offer、同一批链上数据。<b>只改你的偏好</b>，看冠军如何改变——
        Agent 在为你求解，而不是给你推销一个既定答案。
      </p>

      <div className="cf-presets">
        <button
          type="button"
          className="cf-preset cf-preset-base"
          onClick={() => setPref(purchase.baselinePref)}
        >
          <RotateCcw size={11} />下单偏好
        </button>
        {PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.label}
            className="cf-preset"
            onClick={() => setPref(preset.pref)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="cf-sliders">
        {PREF_DIMS.map((dim) => {
          const value = pref[dim.key]
          const share = Math.round((value / total) * 100)
          return (
            <label key={dim.key} className="cf-slider-row">
              <span className="cf-slider-label">{dim.label}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={value}
                onChange={(event) =>
                  setPref((prev) => ({ ...prev, [dim.key]: +event.target.value }))
                }
                style={{ accentColor: dim.color }}
              />
              <span className="cf-slider-share num">{share}%</span>
            </label>
          )
        })}
      </div>

      <div className={`cf-verdict ${switched ? 'switched' : ''}`}>
        {switched ? (
          <>
            偏好一变，冠军从 <s>{baselineChampion!.seller}</s> 翻盘为{' '}
            <b>{currentChampion!.seller}</b>
          </>
        ) : (
          <>
            当前冠军 <b>{currentChampion?.seller ?? '—'}</b>
            <span className="cf-verdict-note">与下单时的选择一致</span>
          </>
        )}
      </div>

      <ol className="cf-list">
        {ranked.map((item, index) => {
          const isChampion = index === 0
          const wasSelected = item.offer.selected
          return (
            <li
              key={item.offer.seller}
              className={`cf-row ${isChampion ? 'champ' : ''}`}
            >
              <span className="cf-rank num">{index + 1}</span>
              {item.offer.image && (
                // 通用委托候选：展示真实商品图；外链失败时隐藏，不留破图
                <img
                  className="cf-thumb"
                  src={item.offer.image}
                  alt={item.offer.seller}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  // 点击商品图放大查看
                  onClick={() => openImageLightbox(item.offer.image!, item.offer.seller)}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
              <div className="cf-main">
                <div className="cf-name-row">
                  <strong>{item.offer.seller}</strong>
                  {isChampion && <span className="cf-tag cf-tag-champ">当前冠军</span>}
                  {wasSelected && !isChampion && (
                    <span className="cf-tag cf-tag-was">下单选择</span>
                  )}
                </div>
                <div className="cf-metric-bars">
                  {METRIC_DIMS.map((dim) => (
                    <span key={dim.key} className="cf-metric">
                      <i
                        style={{
                          height: `${item.offer.metrics[dim.key]}%`,
                          background: dim.color,
                        }}
                      />
                      <em>{dim.label}</em>
                    </span>
                  ))}
                </div>
              </div>
              <div className="cf-side">
                <b className="num">{item.score}</b>
                <span className="cf-side-label">匹配分</span>
                <span className="cf-price num">{yuan(item.offer.price)}</span>
              </div>
            </li>
          )
        })}
      </ol>

      <p className="cf-foot">
        匹配分 = 你的偏好 × 卖家四维链上硬指标。公共信用只记录卖家有没有做到承诺；
        个性化偏好由你的 C-Agent 决策时自行加权，不写入公共信用。
      </p>
    </div>
  )
}
