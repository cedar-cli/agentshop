import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CheckCheck,
  Crown,
  Megaphone,
  RotateCcw,
  Target,
  TriangleAlert,
} from 'lucide-react'
import { useWorld } from '../../core/store'
import {
  analyzeBuyerAgents,
  type ProductProfile,
  type SellerSeed,
} from '../../core/buyer-agent-analysis'
import { FACTORS } from '../../core/evolution'
import { CATEGORIES, type Agent, type Category } from '../../core/types'
import './baa.css'

const FACTOR_LABEL: Record<string, string> = Object.fromEntries(
  FACTORS.map((f) => [f.key, f.label]),
)

const pct = (v: number): string => `${Math.round(v * 100)}%`

/**
 * 买家 Agent 分析：意图 × 商品的「推荐 / 决策」漏斗。
 * 左侧是一系列按意图的商品榜（每个意图一张），右侧是被选中商品自己的意图排行榜。
 */
export function BuyerAgentAnalysis({ seller }: { seller: Agent }) {
  const agents = useWorld((s) => s.agents)
  const [category, setCategory] = useState<Category>(seller.category)
  const [seed, setSeed] = useState(42)
  const [intentTab, setIntentTab] = useState<string>('')
  const [productId, setProductId] = useState<string | null>(null)

  const sellerSeeds = useMemo<SellerSeed[]>(
    () =>
      Object.values(agents)
        .filter((a) => a.role === 'seller')
        .map((a) => ({
          id: a.id,
          name: a.name,
          category: a.category,
          credit: a.credit,
          flagged: a.flagged,
        })),
    [agents],
  )

  const res = useMemo(
    () => analyzeBuyerAgents(sellerSeeds, seller.id, category, seed),
    [sellerSeeds, seller.id, category, seed],
  )

  // 品类/采样变化 → 复位选中意图与商品（默认落在我方主力商品上）
  useEffect(() => {
    setIntentTab(res.intentBoards[0]?.personaId ?? '')
    const myFirst = res.productProfiles.find((p) => p.isMine)
    setProductId(myFirst?.productId ?? res.productProfiles[0]?.productId ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, seed])

  const activeBoard =
    res.intentBoards.find((b) => b.personaId === intentTab) ??
    res.intentBoards[0] ??
    null
  const selectedProfile: ProductProfile | null =
    res.productProfiles.find((p) => p.productId === productId) ??
    res.productProfiles.find((p) => p.isMine) ??
    res.productProfiles[0] ??
    null

  const sum = res.mySummary
  const empty = res.productCount === 0

  return (
    <div className="baa">
      <header className="baa-head">
        <div className="baa-title">
          <span className="eyebrow">
            <BarChart3 size={12} /> 买家 Agent 分析 · 意图 × 商品的推荐 / 决策漏斗
          </span>
          <h3>{category} · 买家 Agent 如何推荐与决策你的商品</h3>
        </div>
        <div className="baa-cats">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={cat === category ? 'on' : ''}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="baa-reseed"
          onClick={() => setSeed((s) => s + 1)}
          title="重新采样一批需求"
        >
          <RotateCcw size={13} />
          <span>重新采样</span>
        </button>
      </header>

      <div className="baa-summary">
        <SummaryCard label="上架商品" value={`${sum.products}`} sub="款" />
        <SummaryCard
          label="平均推荐率"
          value={pct(sum.avgRecommendRate)}
          sub="进入决策集"
          tone="rec"
        />
        <SummaryCard
          label="平均决策率"
          value={pct(sum.avgDecideRate)}
          sub="集内被选中"
          tone="dec"
        />
        <SummaryCard
          label="最强意图"
          value={sum.bestIntentLabel ?? '—'}
          sub="胜出率最高"
          tone="best"
        />
        <SummaryCard
          label="盲区意图"
          value={sum.worstIntentLabel ?? '—'}
          sub="胜出率最低"
          tone="worst"
        />
      </div>

      {empty ? (
        <div className="baa-empty">
          <TriangleAlert size={20} />
          <p>该品类暂无可竞争的在架商品（卖家可能均被风控沉底）。</p>
        </div>
      ) : (
        <div className="baa-body">
          {/* 左：一系列按意图的商品榜 */}
          <section className="baa-boards">
            <div className="baa-panel-title">
              <span className="eyebrow">意图榜单系列 · 每个意图一张商品榜</span>
              <span className="num">共 {res.productCount} 款</span>
            </div>
            <div className="baa-intent-tabs">
              {res.intentBoards.map((b) => (
                <button
                  key={b.personaId}
                  type="button"
                  className={intentTab === b.personaId ? 'on' : ''}
                  onClick={() => setIntentTab(b.personaId)}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {activeBoard && (
              <p className="baa-intent-hint">
                这类买家最看重「{FACTOR_LABEL[activeBoard.strict]}」 ·
                点商品看它自己的意图榜
              </p>
            )}
            <div className="baa-rows">
              {activeBoard?.rows.map((r) => (
                <button
                  type="button"
                  key={r.productId}
                  className={`baa-row ${r.isMine ? 'mine' : ''} ${
                    r.productId === selectedProfile?.productId ? 'sel' : ''
                  } ${r.rank === 1 ? 'lead' : ''}`}
                  onClick={() => setProductId(r.productId)}
                >
                  <span className="baa-rank num">{r.rank}</span>
                  <span className="baa-prod">
                    <span className="baa-prod-name">
                      {r.productName}
                      {r.isMine && <em className="baa-mine-tag">我方</em>}
                    </span>
                    <span className="baa-prod-seller">{r.sellerName}</span>
                  </span>
                  <span className="baa-metrics">
                    <RateBar label="推荐" tone="rec" value={r.recommendRate} />
                    <RateBar label="决策" tone="dec" value={r.decideRate} />
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* 右：被选中商品自己的意图排行榜 */}
          <section className="baa-profile">
            {selectedProfile ? (
              <>
                <div className="baa-panel-title">
                  <span className="eyebrow">商品的意图排行榜 · 跨全部意图的站位</span>
                </div>
                <div className="baa-prof-head">
                  <div className="baa-prof-id">
                    <b>{selectedProfile.productName}</b>
                    <span>
                      {selectedProfile.sellerName}
                      {selectedProfile.isMine && (
                        <em className="baa-mine-tag">我方</em>
                      )}
                    </span>
                  </div>
                  <span className="baa-promo" title="推广力度">
                    <Megaphone size={11} /> 推广 {selectedProfile.promotion}
                  </span>
                </div>

                <div className="baa-standings">
                  {selectedProfile.standings.map((s) => {
                    const tone =
                      s.personaId === selectedProfile.best?.personaId
                        ? 'best'
                        : s.personaId === selectedProfile.worst?.personaId
                          ? 'worst'
                          : ''
                    return (
                      <div key={s.personaId} className={`baa-standing ${tone}`}>
                        <span className="baa-standing-rank num">#{s.rank}</span>
                        <span className="baa-standing-label">
                          {s.personaId === selectedProfile.best?.personaId && (
                            <Crown size={10} />
                          )}
                          {s.label}
                        </span>
                        <span className="baa-standing-rate">
                          <i className="baa-dot rec" />荐 {pct(s.recommendRate)}
                        </span>
                        <span className="baa-standing-rate">
                          <i className="baa-dot dec" />决 {pct(s.decideRate)}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="baa-insight">
                  <span className="baa-insight-icon">
                    <Target size={14} />
                  </span>
                  <p>{selectedProfile.insight}</p>
                </div>
              </>
            ) : (
              <div className="baa-empty">
                <CheckCheck size={18} />
                <p>选择一个商品查看它的意图排行榜</p>
              </div>
            )}
          </section>
        </div>
      )}

      <p className="baa-foot">
        漏斗口径：<b>推荐率</b> = 需求中被买家 Agent 纳入决策集的比例（受推广 ×
        匹配驱动）；<b>决策率</b> =
        进入决策集后被最终选中的比例（受纯匹配驱动）。同一款商品在不同意图下的推荐/决策差异，
        指明「该主推哪些意图、哪些意图需要补强匹配或收缩投放」。
      </p>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone?: 'rec' | 'dec' | 'best' | 'worst'
}) {
  return (
    <div className={`baa-sum-card ${tone ?? ''}`}>
      <span className="baa-sum-label">{label}</span>
      <b className="baa-sum-value num">{value}</b>
      <span className="baa-sum-sub">{sub}</span>
    </div>
  )
}

function RateBar({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'rec' | 'dec'
}) {
  return (
    <span className={`baa-ratebar ${tone}`}>
      <span className="baa-ratebar-label">{label}</span>
      <span className="baa-ratebar-track">
        <i style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="baa-ratebar-val num">{pct(value)}</span>
    </span>
  )
}
