import {
  Bot,
  CircleDollarSign,
  Clock3,
  MessageCircleMore,
  PackageCheck,
  ShieldCheck,
  Store,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DEMO_PURCHASES, getPurchaseById, type DemoEvent } from '../../demo/demoData'
import { adaptMerchantTransaction } from '../../demo/merchantRuntime'
import { useMerchantTransactions } from '../../hooks/useMerchantTransactions'
import { ReplayControls, useReplay } from '../shared/ReplayControls'

export function MerchantDealRoom() {
  const live = useMerchantTransactions()
  const [selectedId, setSelectedId] = useState(DEMO_PURCHASES[0].id)
  const livePurchases = useMemo(() => live.transactions.map(adaptMerchantTransaction), [live.transactions])
  const purchases = useMemo(() => [...livePurchases, ...DEMO_PURCHASES], [livePurchases])
  const latestLiveId = useRef<string>()
  useEffect(() => {
    const newest = livePurchases[0]?.id
    if (newest && newest !== latestLiveId.current) {
      latestLiveId.current = newest
      setSelectedId(newest)
    }
  }, [livePurchases])
  const purchase = purchases.find((item) => item.id === selectedId) ?? getPurchaseById(selectedId) ?? purchases[0] ?? DEMO_PURCHASES[0]
  const replay = useReplay(purchase.id, purchase.events.length)
  const visibleEvents = purchase.events.slice(0, replay.cursor)
  const winner = purchase.offers.find((offer) => offer.selected)!
  const won = Boolean(winner?.selected)

  return (
    <div className="deal-room">
      <aside className="buyer-records">
        <header>
          <div><span className="eyebrow">实时 + 全量留档</span><h3>历史买家记录</h3></div>
          <span className="live-count"><i />{live.apiOnline ? `${live.transactions.length} LIVE API` : 'FIXTURE'}</span>
        </header>
        <div className="buyer-record-list">
          {purchases.map((record) => (
            <button type="button" key={record.id} className={record.id === purchase.id ? 'on' : ''} onClick={() => setSelectedId(record.id)}>
              <span className="buyer-avatar"><Bot size={15} /></span>
              <span className="buyer-record-copy">
                <strong>{record.buyerName}</strong>
                <small>{record.product}</small>
                <em>{record.mechanism}</em>
              </span>
              <span className={`record-status status-${record.status}`}>{record.statusLabel}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="buyer-conversation">
        <header className="buyer-conversation-head">
          <div>
            <span className="eyebrow">Buyer Agent ↔ Seller Fleet</span>
            <h3>买家 Agent 会话</h3>
            <p>{purchase.buyerName} · {purchase.category} · 预算 ¥{purchase.budget.toLocaleString()}</p>
          </div>
          <ReplayControls
            cursor={replay.cursor}
            total={purchase.events.length}
            playing={replay.playing}
            onToggle={replay.toggle}
            onReset={replay.reset}
            onNext={replay.next}
          />
        </header>

        <div className="merchant-chat-scroll scroll-y">
          <div className="deal-signal">
            <div><span>匿名需求轮廓</span><strong>{purchase.constraints.join(' · ')}</strong></div>
            <span className="signal-shield"><ShieldCheck size={14} />身份与底价隐藏</span>
          </div>
          <ol className="merchant-event-list">
            {visibleEvents.map((event, index) => (
              <MerchantEvent key={event.id} event={event} active={replay.playing && index === visibleEvents.length - 1} />
            ))}
          </ol>
        </div>
      </section>

      <aside className="deal-impact scroll-y">
        <div className={`deal-outcome ${won ? 'won' : 'lost'}`}>
          <span className="eyebrow">本次竞争结果</span>
          <strong>{won ? '提案胜出 · 成交' : '未进入最终决策'}</strong>
          <div className="outcome-price"><span className="num">¥{purchase.paid.toLocaleString()}</span><small>订单金额</small></div>
        </div>

        <div className="impact-section">
          <span className="eyebrow">胜负核心依据</span>
          <div className="score-breakdown">
            <Score label="履约信用" value={winner.credit} benchmark="竞品均值 79" color="green" />
            <Score label="约束匹配" value={winner.match} benchmark="硬约束全部满足" color="cyan" />
            <Score label="价格竞争" value={Math.max(64, Math.round(100 - purchase.paid / purchase.budget * 20))} benchmark={`议价节省 ¥${purchase.saved}`} color="gold" />
          </div>
        </div>

        <div className="impact-section">
          <span className="eyebrow">编队内部影响</span>
          <ul className="fleet-impact-list">
            <li><Store size={14} /><span>销售 Agent</span><b>提案胜率 +2.4%</b></li>
            <li><PackageCheck size={14} /><span>供应链 Agent</span><b>锁定同城仓</b></li>
            <li><MessageCircleMore size={14} /><span>客服 Agent</span><b>承诺 2m 响应</b></li>
            <li><CircleDollarSign size={14} /><span>财务 Agent</span><b>毛利 18.6%</b></li>
          </ul>
        </div>

        <div className="impact-section attestation-preview">
          <span className="eyebrow">成交后的信用回流</span>
          <div><TrendingUp size={16} /><span>若按承诺履约</span><b>信用 +0.3</b></div>
          <div><Clock3 size={16} /><span>若延误超过 6h</span><b className="negative">排名 -2</b></div>
        </div>
      </aside>
    </div>
  )
}

function MerchantEvent({ event, active }: { event: DemoEvent; active: boolean }) {
  const buyerSide = event.kind === 'user' || event.actor.includes('C-Agent') || event.actor.includes('买家')
  const system = event.kind === 'attestation' || event.kind === 'fulfilment' || event.kind === 'comparison'
  const Icon = system ? ShieldCheck : buyerSide ? UserRound : Store
  return (
    <li className={`${buyerSide ? 'buyer-side' : 'seller-side'} ${system ? 'system-side' : ''} ${active ? 'active' : ''}`}>
      <span className="merchant-event-icon"><Icon size={14} /></span>
      <div>
        <header><strong>{event.actor}</strong><time className="num">{event.time}</time></header>
        <b>{event.title}</b>
        <p>{event.body}</p>
        {(event.evidence || event.impact) && <footer>{event.evidence && <span>{event.evidence}</span>}{event.impact && <em>{event.impact}</em>}</footer>}
      </div>
    </li>
  )
}

function Score({ label, value, benchmark, color }: { label: string; value: number; benchmark: string; color: string }) {
  return (
    <div className="score-row">
      <div><span>{label}</span><b className="num">{value}</b></div>
      <span className="score-track"><i className={`score-${color}`} style={{ width: `${value}%` }} /></span>
      <small>{benchmark}</small>
    </div>
  )
}
