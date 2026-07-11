import { useMemo, useState } from 'react'
import { useWorld } from '../../core/store'
import { activeLinks } from '../../core/selectors'
import type { Agent, RiskKind } from '../../core/types'
import { TopologyCanvas } from './TopologyCanvas'
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
