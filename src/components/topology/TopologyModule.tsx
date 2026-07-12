import { useEffect, useMemo, useState } from 'react'
import { useWorld } from '../../core/store'
import { activeLinks } from '../../core/selectors'
import type { Agent, RiskKind, Transaction } from '../../core/types'
import { TopologyCanvas, type Narration } from './TopologyCanvas'
import { SupplyChainStage } from './SupplyChainStage'
import { RadarChart } from '../shared/RadarChart'
import { AttestationChip } from '../shared/AttestationChip'
import './topology.css'

const LEGEND = [
  { c: 'var(--color-consumer)', label: 'C-Agent 买家' },
  { c: 'var(--color-seller)', label: 'S-Agent 卖家' },
  { c: 'var(--color-supply)', label: '供应链 Agent' },
  { c: 'var(--color-factory)', label: '工厂 S-Agent' },
]

type View = 'story' | 'panorama'

export function TopologyModule() {
  const [view, setView] = useState<View>('story')

  return (
    <div className="module">
      <div className="module-head">
        <div>
          <h2 className="module-title">
            网络拓扑 <span className="tag">DRN · 决策准入网络</span>
          </h2>
          <p className="module-desc">
            {view === 'story'
              ? '跟随一笔交易走完全链：需求 → 竞价 → 信用择优 → 供应链递归采购 → 履约上链 → 信用回写。'
              : '全域 Agent 交易全景：光点为在线 Agent，连线为实时供需匹配链路。这是上面那条链在全网的规模化并发。'}
          </p>
        </div>
        <div className="topo-viewswitch">
          <button
            className={view === 'story' ? 'on' : ''}
            onClick={() => setView('story')}
          >
            剧情演示
            <span>一笔交易的全链闭环</span>
          </button>
          <button
            className={view === 'panorama' ? 'on' : ''}
            onClick={() => setView('panorama')}
          >
            全网全景
            <span>规模化并发</span>
          </button>
        </div>
      </div>

      {view === 'story' ? <SupplyChainStage /> : <Panorama />}
    </div>
  )
}

function Panorama() {
  const agents = useWorld((s) => s.agents)
  const transactions = useWorld((s) => s.transactions)
  const attestations = useWorld((s) => s.attestations)
  const injectRisk = useWorld((s) => s.injectRisk)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [heat, setHeat] = useState(false)
  const [supplyFocus, setSupplyFocus] = useState(false)

  const allNodes = useMemo(() => Object.values(agents), [agents])
  const nodes = useMemo(
    () => (supplyFocus ? allNodes.filter((a) => a.role !== 'consumer') : allNodes),
    [allNodes, supplyFocus],
  )
  const links = useMemo(() => {
    const all = activeLinks(transactions)
    return supplyFocus ? all.filter((l) => l.upstream) : all
  }, [transactions, supplyFocus])

  // 降噪：只有出现在活跃链路上的节点保持明亮，其余变暗
  const activeIds = useMemo(() => {
    const s = new Set<string>()
    for (const l of links) {
      s.add(l.from)
      s.add(l.to)
    }
    return s
  }, [links])

  const pulses = useMemo(
    () =>
      attestations
        .slice(0, 12)
        .map((a) => ({ id: a.id, sellerId: a.sellerId, verdict: a.verdict })),
    [attestations],
  )

  // 焦点交易：锁定一笔非上游交易，跟随它走完 signal→bidding→settled→fulfilling，
  // 完成（attested）后自动切换到下一笔最新交易。让全景可以“看清一笔在发生什么”。
  const [focusTxId, setFocusTxId] = useState<string | null>(null)
  useEffect(() => {
    setFocusTxId((cur) => {
      const curTx = cur ? transactions.find((t) => t.id === cur) : undefined
      if (curTx && curTx.status !== 'attested') return cur
      const next = transactions
        .filter((t) => t.status !== 'attested' && !t.upstream)
        .sort((a, b) => b.statusTick - a.statusTick)[0]
      return next ? next.id : null
    })
  }, [transactions])

  const focusTx = focusTxId
    ? transactions.find((t) => t.id === focusTxId) ?? null
    : null

  const focusIds = useMemo(() => {
    const s = new Set<string>()
    if (focusTx) {
      s.add(focusTx.buyerId)
      if (focusTx.sellerId) s.add(focusTx.sellerId)
      for (const p of focusTx.proposals.slice(0, 4)) s.add(p.sellerId)
    }
    return s
  }, [focusTx])

  const narration = useMemo<Narration | null>(
    () => buildNarration(focusTx, agents),
    [focusTx, agents],
  )

  const selected = selectedId ? agents[selectedId] : null

  return (
    <div className="topo-stage">
      <div className="topo-layers floating">
        <button className={heat ? 'on' : ''} onClick={() => setHeat((v) => !v)}>
          信用活跃度底色
        </button>
        <button
          className={supplyFocus ? 'on' : ''}
          onClick={() => setSupplyFocus((v) => !v)}
        >
          多层供应链视角
        </button>
      </div>

      <TopologyCanvas
        nodes={nodes}
        links={links}
        onSelect={(a) => setSelectedId(a.id)}
        selectedId={selectedId}
        showHeat={heat}
        chainAnchor
        attestationPulses={pulses}
        activeIds={activeIds}
        focusIds={focusIds}
        narration={narration}
      />

      <div className="topo-legend panel">
        <div className="eyebrow">图例</div>
        {LEGEND.map((l) => (
          <div key={l.label} className="lg-row">
            <span className="lg-dot" style={{ background: l.c }} />
            {l.label}
          </div>
        ))}
        <div className="lg-sep" />
        <div className="lg-row">
          <span className="lg-line gold" /> 竞价提案（虚线）
        </div>
        <div className="lg-row">
          <span className="lg-line cyan" /> 成交/履约链路
        </div>
        <div className="lg-row">
          <span className="lg-line purple" /> 上游供应链
        </div>
      </div>

      {selected && (
        <NodePanel
          agent={selected}
          onClose={() => setSelectedId(null)}
          onRisk={(k) => injectRisk(k, selected.id)}
        />
      )}
    </div>
  )
}

function NodePanel({
  agent,
  onClose,
  onRisk,
}: {
  agent: Agent
  onClose: () => void
  onRisk: (k: RiskKind) => void
}) {
  const attestations = useWorld((s) => s.attestations)
  const transactions = useWorld((s) => s.transactions)
  const recent = attestations
    .filter((a) => a.sellerId === agent.id || a.buyerId === agent.id)
    .slice(0, 6)

  const biddingTx = transactions.find(
    (t) => t.buyerId === agent.id && t.status === 'bidding',
  )

  const canRisk = agent.role === 'seller' || agent.role === 'supply'

  return (
    <div className="node-panel panel">
      <header className="np-head">
        <div>
          <div className="eyebrow">{roleFull(agent.role)}</div>
          <h3>{agent.name}</h3>
        </div>
        <button className="np-close" onClick={onClose}>
          ✕
        </button>
      </header>

      <div className="np-body scroll-y">
        <div className="np-radar">
          <RadarChart vector={agent.vector} size={180} />
          <div className="np-credit">
            <span className="num">{agent.credit}</span>
            <span>综合信用</span>
            {agent.flagged && <span className="np-flag">风控降级</span>}
          </div>
        </div>

        {biddingTx && (
          <div className="np-compete">
            <div className="eyebrow">竞争结果 · 进入决策集资格争夺</div>
            <div className="np-compete-meta">
              {biddingTx.category} · 预算 ≤¥{biddingTx.maxPrice} · {biddingTx.qty} 件
            </div>
            <ol className="np-props">
              {biddingTx.proposals.map((p) => {
                const s = useWorld.getState().agents[p.sellerId]
                return (
                  <li key={p.sellerId} className={p.won ? 'won' : ''}>
                    <span className="np-rank num">#{p.rank}</span>
                    <span className="np-sname">{s?.name ?? p.sellerId}</span>
                    <span className="num">¥{p.price}</span>
                    <span className="num np-pcredit">信{p.credit}</span>
                    <span className="num np-match">{p.matchScore}</span>
                  </li>
                )
              })}
            </ol>
            <div className="np-hint">
              匹配分 = 买家偏好加权（信用×时效×价格×售后），全取自链上硬指标
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div className="np-atts">
            <div className="eyebrow">相关链上鉴证</div>
            <div className="np-att-list">
              {recent.map((a) => (
                <AttestationChip key={a.id} att={a} compact />
              ))}
            </div>
          </div>
        )}

        {canRisk && (
          <div className="np-risk">
            <div className="eyebrow">风控演示 · 触发信用净化</div>
            <div className="np-risk-btns">
              <button onClick={() => onRisk('brush')} disabled={agent.flagged}>
                模拟刷分
              </button>
              <button onClick={() => onRisk('fake-tx')} disabled={agent.flagged}>
                伪造交易
              </button>
              <button
                className="danger"
                onClick={() => onRisk('breach')}
                disabled={agent.flagged}
              >
                违约不赔
              </button>
            </div>
            <div className="np-hint">
              {agent.flagged
                ? '已被信用链处置：匹配归零、准入降级。唯一修复途径是优化后续履约。'
                : '注入后信用链多节点交叉校验，识别即全网降级。'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function roleFull(role: string) {
  return role === 'consumer'
    ? 'C-Agent 消费者'
    : role === 'seller'
      ? 'S-Agent 卖家'
      : role === 'supply'
        ? '供应链 Agent（对上游为买家）'
        : '工厂 S-Agent'
}

/** 依焦点交易的当前阶段，生成一段“正在发生什么”的解说，锚定买家节点。 */
function buildNarration(
  tx: Transaction | null,
  agents: Record<string, Agent>,
): Narration | null {
  if (!tx || tx.status === 'attested') return null
  const buyer = agents[tx.buyerId]
  if (!buyer) return null
  const n = tx.proposals.length
  const winner = tx.proposals.find((p) => p.won)
  const winnerName =
    (tx.sellerId && agents[tx.sellerId]?.name) ||
    (winner && agents[winner.sellerId]?.name) ||
    '中标商家'
  const price = tx.price ?? winner?.price ?? tx.maxPrice
  const base = { anchorId: tx.buyerId }

  switch (tx.status) {
    case 'signal':
      return {
        ...base,
        tone: 'signal',
        kicker: '需求广播 · SIGNAL',
        title: buyer.name,
        body: `发起「${tx.category} ×${tx.qty}」需求，预算 ≤¥${tx.maxPrice}、${tx.withinDays} 天内送达。需求 Agent 正向全网匿名广播，不暴露身份与底价。`,
        metaLeft: '等待 S-Agent 应征',
        metaRight: `≤¥${tx.maxPrice}`,
      }
    case 'bidding': {
      const top = tx.proposals[0]
      const topName = top ? agents[top.sellerId]?.name ?? '领先商家' : '领先商家'
      return {
        ...base,
        tone: 'bidding',
        kicker: '机器竞价 · BIDDING',
        title: `${tx.category} · ${n} 家 S-Agent 竞价`,
        body: `${topName} 等 ${n} 家应征。RepChain 按买家偏好加权（信用×时效×价格×售后）排序，当前领先匹配分 ${top?.matchScore ?? '—'}。`,
        metaLeft: `买家 ${buyer.name}`,
        metaRight: `候选 ${n}`,
      }
    }
    case 'settled':
      return {
        ...base,
        tone: 'settled',
        kicker: '择优成交 · SETTLED',
        title: `${winnerName} 中标`,
        body: `${buyer.name} 择优 ${winnerName}：¥${price} 成交——非最低价，但链上硬指标领先。财务 Agent 托管支付，全程留痕。`,
        metaLeft: tx.category,
        metaRight: `¥${price}`,
      }
    case 'fulfilling':
      return {
        ...base,
        tone: 'fulfilling',
        kicker: '履约中 · FULFILLING',
        title: `${winnerName} 履约`,
        body: `干线运输与验收进行中，即将自动生成不可篡改的链上鉴证芯片，并按买家信用加权回写卖家画像。`,
        metaLeft: tx.category,
        metaRight: `¥${price}`,
      }
    default:
      return null
  }
}
