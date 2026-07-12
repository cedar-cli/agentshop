import {
  ArrowUp,
  Activity,
  Bot,
  Check,
  CheckCircle2,
  PackageCheck,
  Plus,
  Radar,
  Play,
  RefreshCcw,
  FastForward,
  Zap,
} from 'lucide-react'
import { useMemo } from 'react'
import { DEMO_PURCHASES, getPurchaseById, type DemoPurchase } from '../../demo/demoData'
import { ReplayControls, useReplay } from '../shared/ReplayControls'
import { CounterfactualPanel } from './CounterfactualPanel'
import { EventRow } from './EventRow'
import { RestockMonitor } from './RestockMonitor'
import { LowPriceWatch } from './LowPriceWatch'
import { adaptLaptopPurchase } from '../../demo/laptopRuntime'
import { DEFAULT_LAPTOP_REQUEST, useLaptopPurchase } from '../../hooks/useLaptopPurchase'
import { adaptRestockPurchase } from '../../demo/restockRuntime'
import type { HouseholdRestockRuntime } from '../../hooks/useHouseholdRestock'
import type { ConsumerDelegationsRuntime, DelegationSession } from '../../hooks/useConsumerDelegations'
import { adaptDelegation, DELEGATION_MODES, getDelegationMode } from '../../demo/delegationRuntime'
import { DelegationComposer } from './DelegationComposer'

const NEW_ID = '__new__'

export function ConsumerConversation({
  selectedId,
  onSelect,
  restock,
  delegations,
}: {
  selectedId: string
  onSelect: (id: string) => void
  restock: HouseholdRestockRuntime
  delegations: ConsumerDelegationsRuntime
}) {
  const laptop = useLaptopPurchase()
  const isNew = selectedId === NEW_ID
  const delegationSession = delegations.sessions.find((session) => session.localId === selectedId)
  const isDelegation = Boolean(delegationSession)

  const basePurchase = getPurchaseById(selectedId) ?? DEMO_PURCHASES[0]
  const isLaptop = !isDelegation && !isNew && basePurchase.id === 'laptop-trip'
  const isRestock = !isDelegation && !isNew && basePurchase.id === 'paper-restock'
  const isLowprice = !isDelegation && !isNew && basePurchase.id === 'camera-lowprice'

  const purchase = isDelegation
    ? adaptDelegation(delegationSession as DelegationSession)
    : isLaptop
      ? adaptLaptopPurchase(basePurchase, laptop.events)
      : isRestock
        ? adaptRestockPurchase(basePurchase, restock.events)
        : basePurchase

  const replayKey = delegationSession?.transactionId ?? laptop.transactionId ?? restock.transactionId ?? purchase.id
  const replay = useReplay(replayKey, purchase.events.length)
  const visibleEvents = purchase.events.slice(0, replay.cursor)

  const startDelegation = (requestText: string, mode: DelegationSession['mode']) => {
    const localId = delegations.create(requestText, mode)
    onSelect(localId)
  }

  const demoPurchases = useMemo(
    () => DEMO_PURCHASES.map((item) => (item.id === purchase.id ? purchase : item)),
    [purchase],
  )
  const grouped = useMemo(
    () => ({
      active: demoPurchases.filter((item) => item.status !== 'completed'),
      history: demoPurchases.filter((item) => item.status === 'completed'),
    }),
    [demoPurchases],
  )
  const delegationGroups = useMemo(
    () => ({
      running: delegations.sessions.filter((session) => session.phase !== 'completed'),
      done: delegations.sessions.filter((session) => session.phase === 'completed'),
    }),
    [delegations.sessions],
  )

  return (
    <div className="consumer-workspace">
      <aside className="purchase-rail">
        <div className="rail-title-row">
          <div>
            <span className="eyebrow">全部委托</span>
            <h3>委托与历史</h3>
          </div>
          <button
            type="button"
            className={`rail-new-button ${isNew ? 'on' : ''}`}
            onClick={() => onSelect(NEW_ID)}
          >
            <Plus size={14} />新建委托
          </button>
        </div>

        {delegations.sessions.length > 0 && (
          <div className="history-group">
            <span className="history-label">委托任务 · 真实 LLM</span>
            <div className="history-list">
              {[...delegationGroups.running, ...delegationGroups.done].map((session) => (
                <DelegationRailItem
                  key={session.localId}
                  session={session}
                  selected={selectedId === session.localId}
                  onSelect={() => onSelect(session.localId)}
                />
              ))}
            </div>
          </div>
        )}

        <HistoryGroup label="进行中" items={grouped.active} selectedId={selectedId} onSelect={onSelect} />
        <HistoryGroup label="已完成" items={grouped.history} selectedId={selectedId} onSelect={onSelect} />
      </aside>

      {isNew ? (
        <NewDelegationStage onSubmit={startDelegation} />
      ) : (
        <>
          <section className="conversation-panel">
            <header className="conversation-head">
              <div className="conversation-product">
                <span className={`status-dot status-${purchase.status}`} />
                <div>
                  <h3>{purchase.title}</h3>
                  <div className="conversation-meta">
                    <span>{purchase.sceneLabel}</span>
                    <span>{purchase.authorization}</span>
                    <span className="num">可信度 {purchase.trustScore}</span>
                  </div>
                </div>
              </div>
              {isDelegation ? (
                <DelegationControls
                  session={delegationSession as DelegationSession}
                  onRerun={() => startDelegation((delegationSession as DelegationSession).requestText, (delegationSession as DelegationSession).mode)}
                  replay={replay}
                  total={purchase.events.length}
                />
              ) : isLaptop ? (
                <LaptopControls
                  phase={laptop.phase}
                  awaitingApproval={laptop.awaitingApproval}
                  approving={laptop.approving}
                  completed={laptop.phase === 'completed'}
                  llmCount={laptop.events.filter((event) => event.payload.generatedBy === 'llm').length}
                  fallbackCount={laptop.events.filter((event) => event.payload.generatedBy === 'fallback').length}
                  onStart={() => laptop.start(DEFAULT_LAPTOP_REQUEST)}
                  onApprove={() => void laptop.approve()}
                  replay={replay}
                  total={purchase.events.length}
                />
              ) : isRestock ? (
                <RestockControls
                  phase={restock.phase}
                  onStart={restock.start}
                  replay={replay}
                  total={purchase.events.length}
                />
              ) : isLowprice ? (
                <div className="runtime-running autonomous">
                  <Radar size={14} className="runtime-spin" />自动蹲低价执行中
                </div>
              ) : (
                <ReplayControls
                  cursor={replay.cursor}
                  total={purchase.events.length}
                  playing={replay.playing}
                  onToggle={replay.toggle}
                  onReset={replay.reset}
                  onNext={replay.next}
                />
              )}
            </header>

            <div className="conversation-scroll scroll-y">
              {isLowprice ? (
                <LowPriceWatch purchase={purchase} />
              ) : (
                <>
                  {isRestock && <AutonomousBanner phase={restock.phase} />}
                  {isDelegation && <DelegationBanner session={delegationSession as DelegationSession} />}
                  {isRestock && restock.phase === 'idle' ? (
                    <RestockMonitor onTrigger={restock.start} />
                  ) : (
                    <>
                      <div className="conversation-opening">
                        <span className="opening-icon"><Bot size={18} /></span>
                        <div>
                          <strong>{openingTitle(purchase.scene, isDelegation)}</strong>
                          <p>{purchase.trigger}。{purchase.result}</p>
                        </div>
                      </div>

                      <div className="audit-heading">
                        <span className="eyebrow">可审计决策日志</span>
                        <span className="audit-note">规则 · 证据 · 动作 · 影响</span>
                      </div>

                      <ol className="event-stream">
                        {visibleEvents.map((event, index) => (
                          <EventRow key={event.id} event={event} active={replay.playing && index === visibleEvents.length - 1} />
                        ))}
                      </ol>
                    </>
                  )}

                  {(isDelegation ? delegationSession?.error : isLaptop ? laptop.error : isRestock ? restock.error : undefined) && (
                    <div className="runtime-error">{isDelegation ? delegationSession?.error : isLaptop ? laptop.error : restock.error} · 已保留可审计事件链，可重新执行。</div>
                  )}
                </>
              )}
            </div>

            {isRestock ? (
              <form className="agent-composer" onSubmit={(event) => event.preventDefault()}>
                <input aria-label="向消费 Agent 描述需求" disabled placeholder="自主补库由库存预测触发，无需输入购买指令" />
                <button type="submit" aria-label="发送需求" disabled><ArrowUp size={18} /></button>
              </form>
            ) : isLowprice ? (
              <form className="agent-composer" onSubmit={(event) => event.preventDefault()}>
                <input aria-label="向消费 Agent 描述需求" disabled placeholder="自动蹲低价由价格监测驱动，命中目标价后请你确认" />
                <button type="submit" aria-label="发送需求" disabled><ArrowUp size={18} /></button>
              </form>
            ) : (
              <DelegationComposer onSubmit={startDelegation} />
            )}
          </section>

          <aside className="decision-inspector scroll-y">
            <div className="inspector-block">
              <span className="eyebrow">本次任务</span>
              <h3>{purchase.product}</h3>
              <div className="purchase-kpis">
                <Kpi label="预算" value={purchase.budget > 0 ? `¥${purchase.budget.toLocaleString()}` : '—'} />
                <Kpi label="成交" value={purchase.paid > 0 ? `¥${purchase.paid.toLocaleString()}` : '—'} accent />
                <Kpi label="总收益" value={`¥${purchase.saved.toLocaleString()}`} positive />
              </div>
              <div className="constraint-list">
                {purchase.constraints.map((constraint) => <span key={constraint}><Check size={12} />{constraint}</span>)}
              </div>
            </div>

            <CounterfactualPanel purchase={purchase} />

            <div className="inspector-block memory-block">
              <span className="eyebrow">长期记忆更新</span>
              <p>{purchase.memory}</p>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

function NewDelegationStage({ onSubmit }: { onSubmit: (requestText: string, mode: DelegationSession['mode']) => void }) {
  return (
    <section className="conversation-panel new-delegation-stage">
      <div className="conversation-scroll scroll-y">
        <div className="new-delegation-hero">
          <span className="new-delegation-mark"><Bot size={22} /></span>
          <h3>新增委托任务</h3>
          <p>直接说明完整购物意图，或输入 <b>@</b> 选择主动服务方式。发出后由消费 Agent 全自动接管，真实 LLM 完成比较、议价、下单与链上鉴证。</p>
        </div>
        <div className="new-delegation-modes">
          {DELEGATION_MODES.map((meta) => (
            <div className="new-delegation-mode" key={meta.mode}>
              <span className="mode-tag"><Radar size={12} />{meta.label}</span>
              <small>{meta.hint}</small>
            </div>
          ))}
        </div>
        <div className="new-delegation-examples">
          <span className="eyebrow">示例意图</span>
          <button type="button" onClick={() => onSubmit('出差前买一台轻薄本，预算 9000，续航优先，3 天内到，全国联保。', 'auto')}>
            出差前买一台轻薄本，预算 9000，续航优先…
          </button>
          <button type="button" onClick={() => onSubmit('高值相机蹲到全年低价再买，必须官方保修。', 'lowprice')}>
            <span className="example-mode">@高值蹲低价</span> 相机蹲到全年低价再买…
          </button>
        </div>
      </div>
      <DelegationComposer onSubmit={onSubmit} autoFocus />
    </section>
  )
}

function DelegationRailItem({ session, selected, onSelect }: { session: DelegationSession; selected: boolean; onSelect: () => void }) {
  const meta = getDelegationMode(session.mode)
  const running = session.phase === 'queued' || session.phase === 'running'
  const failed = session.phase === 'failed'
  const statusLabel = session.phase === 'completed' ? '自动完成' : failed ? '执行失败' : running ? 'Agent 执行中' : '排队中'
  return (
    <button type="button" className={selected ? 'on' : ''} onClick={onSelect}>
      <span className={`history-icon scene-${meta.scene}`}>
        {running ? <Activity size={15} className="runtime-spin" /> : <Bot size={15} />}
      </span>
      <span className="history-copy">
        <strong>{session.requestText.length > 14 ? `${session.requestText.slice(0, 14)}…` : session.requestText}</strong>
        <small>{meta.label} · {statusLabel}</small>
      </span>
      <span className={`delegation-rail-dot phase-${session.phase}`} />
    </button>
  )
}

function HistoryGroup({
  label,
  items,
  selectedId,
  onSelect,
}: {
  label: string
  items: DemoPurchase[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="history-group">
      <span className="history-label">{label}</span>
      <div className="history-list">
        {items.map((item) => (
          <button key={item.id} type="button" className={selectedId === item.id ? 'on' : ''} onClick={() => onSelect(item.id)}>
            <span className={`history-icon scene-${item.scene}`}><PackageCheck size={15} /></span>
            <span className="history-copy">
              <strong>{item.title}</strong>
              <small>{item.statusLabel} · {item.date}</small>
            </span>
            <span className="history-price num">¥{item.paid.toLocaleString()}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function DelegationControls({
  session,
  onRerun,
  replay,
  total,
}: {
  session: DelegationSession
  onRerun: () => void
  replay: ReturnType<typeof useReplay>
  total: number
}) {
  const running = session.phase === 'queued' || session.phase === 'running'
  const completed = session.phase === 'completed'
  const llmCount = session.events.filter((event) => event.payload.generatedBy === 'llm').length
  const fallbackCount = session.events.filter((event) => event.payload.generatedBy === 'fallback').length
  if (running) {
    return <div className="runtime-running"><Activity size={14} className="runtime-spin" />Agent 全自动采购中</div>
  }
  if (completed) {
    return (
      <div className="runtime-completed-controls">
        <div className="runtime-rerun-wrap">
          <span className={fallbackCount > 0 ? 'runtime-source fallback' : 'runtime-source llm'}>
            本次：LLM {llmCount} · fallback {fallbackCount}
          </span>
          <button type="button" className="runtime-action" onClick={onRerun}>
            <RefreshCcw size={14} />再发起一次
          </button>
        </div>
        <ReplayControls cursor={replay.cursor} total={total} playing={replay.playing} onToggle={replay.toggle} onReset={replay.reset} onNext={replay.next} />
      </div>
    )
  }
  return (
    <button type="button" className="runtime-action" onClick={onRerun}>
      <RefreshCcw size={14} />重新发起委托
    </button>
  )
}

function DelegationBanner({ session }: { session: DelegationSession }) {
  const meta = getDelegationMode(session.mode)
  const completed = session.phase === 'completed'
  const running = session.phase === 'queued' || session.phase === 'running'
  return (
    <div className={`autonomous-banner ${completed ? 'completed' : running ? 'running' : ''}`}>
      <span className="autonomous-icon"><Zap size={15} /></span>
      <div>
        <strong>AUTONOMOUS DELEGATION</strong>
        <p>{completed ? 'Agent 已在授权内全自动完成本次委托，人类点击 0 次。' : running ? '委托已发出，消费 Agent 正全自动接管真实 LLM 会话与交易。' : '委托排队中，即将由消费 Agent 自动执行。'}</p>
      </div>
      <dl>
        <div><dt>主动服务方式</dt><dd>{meta.label}</dd></div>
        <div><dt>授权源</dt><dd>{meta.authorization}</dd></div>
      </dl>
    </div>
  )
}

function RestockControls({
  phase,
  onStart,
  replay,
  total,
}: {
  phase: 'idle' | 'queued' | 'running' | 'completed' | 'failed'
  onStart: () => void
  replay: ReturnType<typeof useReplay>
  total: number
}) {
  if (phase === 'queued' || phase === 'running') {
    return <div className="runtime-running autonomous"><Activity size={14} className="runtime-spin" />自主补库执行中</div>
  }
  if (phase === 'completed') {
    return (
      <div className="runtime-completed-controls">
        <ReplayControls cursor={replay.cursor} total={total} playing={replay.playing} onToggle={replay.toggle} onReset={replay.reset} onNext={replay.next} />
        <button type="button" className="runtime-icon-button" onClick={onStart} title="重新演示" aria-label="重新演示家庭补库"><RefreshCcw size={14} /></button>
      </div>
    )
  }
  return (
    <div className="restock-demo-control">
      <span>演示控制 · 非购买指令</span>
      <button type="button" className="runtime-action autonomous" onClick={onStart}>
        <FastForward size={14} />推进到库存触发点
      </button>
    </div>
  )
}

function AutonomousBanner({ phase }: { phase: 'idle' | 'queued' | 'running' | 'completed' | 'failed' }) {
  const completed = phase === 'completed'
  const running = phase === 'queued' || phase === 'running'
  return (
    <div className={`autonomous-banner ${completed ? 'completed' : running ? 'running' : ''}`}>
      <span className="autonomous-icon"><Zap size={15} /></span>
      <div>
        <strong>AUTONOMOUS MODE</strong>
        <p>{completed ? 'Agent 已在长期授权内自主完成购买，人类交互 0 次。' : running ? '没有人类采购指令，库存预测已触发自主执行。' : 'Agent 持续监测家庭库存，达到阈值后将自行采购。'}</p>
      </div>
      <dl>
        <div><dt>触发源</dt><dd>库存预测模型</dd></div>
        <div><dt>授权源</dt><dd>家庭补库长期委托</dd></div>
      </dl>
    </div>
  )
}

function LaptopControls({
  phase,
  awaitingApproval,
  approving,
  completed,
  llmCount,
  fallbackCount,
  onStart,
  onApprove,
  replay,
  total,
}: {
  phase: 'idle' | 'queued' | 'running' | 'completed' | 'failed'
  awaitingApproval: boolean
  approving: boolean
  completed: boolean
  llmCount: number
  fallbackCount: number
  onStart: () => void
  onApprove: () => void
  replay: ReturnType<typeof useReplay>
  total: number
}) {
  if (awaitingApproval) {
    return (
      <button type="button" className="runtime-action approve" onClick={onApprove} disabled={approving}>
        {approving ? <Activity size={14} className="runtime-spin" /> : <CheckCircle2 size={14} />}
        {approving ? '正在确认' : '确认下单'}
      </button>
    )
  }
  if (phase === 'queued' || phase === 'running') {
    return <div className="runtime-running"><Activity size={14} className="runtime-spin" />Agent 网络采购中</div>
  }
  if (completed) {
    return (
      <div className="runtime-completed-controls">
        <div className="runtime-rerun-wrap">
          <span className={fallbackCount > 0 ? 'runtime-source fallback' : 'runtime-source llm'}>
            本次：LLM {llmCount} · fallback {fallbackCount}
          </span>
          <button type="button" className="runtime-action" onClick={onStart}>
            <RefreshCcw size={14} />重新运行真实 LLM
          </button>
        </div>
        <ReplayControls cursor={replay.cursor} total={total} playing={replay.playing} onToggle={replay.toggle} onReset={replay.reset} onNext={replay.next} />
      </div>
    )
  }
  return (
    <button type="button" className="runtime-action" onClick={onStart}>
      <Play size={14} />运行真实 LLM
    </button>
  )
}

function Kpi({ label, value, accent, positive }: { label: string; value: string; accent?: boolean; positive?: boolean }) {
  return <div className={`purchase-kpi ${accent ? 'accent' : ''} ${positive ? 'positive' : ''}`}><span>{label}</span><b className="num">{value}</b></div>
}

function openingTitle(scene: string, isDelegation: boolean) {
  if (isDelegation) return '我已全自动接管这次委托'
  if (scene === 'passive') return '我已接管这次购买委托'
  if (scene === 'restock') return '我正在持续监测家庭库存'
  if (scene === 'scarce') return '稀缺资源已在授权内锁定'
  if (scene === 'lowprice') return '发现可信低价，等待你的确认'
  return '二手寻源与托管验机正在执行'
}
