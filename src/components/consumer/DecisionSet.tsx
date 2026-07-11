import { useMemo } from 'react'
import { useWorld } from '../../core/store'
import { matchScore } from '../../core/credit'
import { myTransactions } from '../../core/selectors'
import type { Transaction } from '../../core/types'
import { yuan } from '../../lib/format'

/** 决策集：对当前需求的提案，按偏好权重实时重排（§3.4 核心交互） */
export function DecisionSet() {
  const preference = useWorld((s) => s.preference)
  const transactions = useWorld((s) => s.transactions)
  const agents = useWorld((s) => s.agents)
  const meId = useWorld((s) => s.meConsumerId)

  const tx = useMemo(
    () => pickActive(myTransactions(transactions, meId)),
    [transactions, meId],
  )

  const ranked = useMemo(() => {
    if (!tx) return []
    return tx.proposals
      .map((p) => {
        const seller = agents[p.sellerId]
        const ms = seller
          ? matchScore(seller, p.price, tx.maxPrice, p.promisedDays, preference)
          : 0
        return { ...p, seller, liveScore: ms }
      })
      .filter((p) => p.seller)
      .sort((a, b) => b.liveScore - a.liveScore)
  }, [tx, agents, preference])

  if (!tx) {
    return (
      <div className="ds-empty panel-inset">
        <span>暂无进行中的需求竞价</span>
        <span className="ds-empty-sub">
          在上方发布需求轮廓信号，S-Agent 将自动竞价进入你的决策集
        </span>
      </div>
    )
  }

  return (
    <div className="decision-set">
      <div className="ds-meta">
        <span className="tag">{tx.category}</span>
        <span>预算 ≤ {yuan(tx.maxPrice)}</span>
        <span>· {tx.withinDays} 天内</span>
        <span>· {tx.qty} 件</span>
        <span className="ds-status">{statusLabel(tx.status)}</span>
      </div>

      <ol className="ds-list">
        {ranked.map((p, i) => (
          <li
            key={p.sellerId}
            className={`ds-card ${i === 0 ? 'chosen' : ''} ${
              p.seller!.flagged ? 'flagged' : ''
            }`}
          >
            <div className="ds-rank num">{i + 1}</div>
            <div className="ds-main">
              <div className="ds-name">
                {p.seller!.name}
                {i === 0 && <span className="ds-badge">入选决策集</span>}
                {p.seller!.professional && <span className="ds-pro">专业</span>}
              </div>
              <div className="ds-bars">
                <Bar label="信用" v={p.seller!.credit} c="var(--color-fulfil)" />
                <Bar
                  label="时效"
                  v={p.seller!.vector.timeliness}
                  c="var(--color-data)"
                />
                <Bar label="品质" v={p.seller!.vector.spec} c="var(--color-verify)" />
                <Bar
                  label="售后"
                  v={p.seller!.vector.afterSales}
                  c="var(--color-proposal)"
                />
              </div>
            </div>
            <div className="ds-side">
              <div className="ds-price num">{yuan(p.price)}</div>
              <div className="ds-days">{p.promisedDays} 天达</div>
              <div className="ds-match num">
                {p.liveScore}
                <span>匹配分</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="ds-foot">
        拖动右侧偏好滑块 → 同一批卖家的匹配排序实时改变。公共信用只衡量卖家有没有做到承诺，个性化偏好由你的
        C-Agent 决策时自行加权。
      </div>
    </div>
  )
}

function Bar({ label, v, c }: { label: string; v: number; c: string }) {
  return (
    <div className="ds-bar">
      <span className="ds-bar-label">{label}</span>
      <span className="ds-bar-track">
        <span className="ds-bar-fill" style={{ width: `${v}%`, background: c }} />
      </span>
      <span className="ds-bar-val num">{Math.round(v)}</span>
    </div>
  )
}

function pickActive(txs: Transaction[]): Transaction | null {
  // 优先进行中的竞价，其次任意有提案的交易（含已成交/已鉴证），保证发布后始终可见
  const withProps = txs.filter((t) => t.proposals.length)
  const active = withProps.filter((t) => t.status !== 'attested')
  const pool = active.length ? active : withProps
  const bidding = pool.filter((t) => t.status === 'bidding')
  const chosen = bidding.length ? bidding : pool
  return chosen.length ? chosen[chosen.length - 1] : null
}

function statusLabel(s: string) {
  return s === 'bidding'
    ? '竞价中'
    : s === 'settled'
      ? '已成交'
      : s === 'fulfilling'
        ? '履约中'
        : s
}
