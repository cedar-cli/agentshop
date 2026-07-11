import { useWorld } from '../../core/store'
import type { Agent, CreditVector } from '../../core/types'

interface FleetRole {
  key: string
  name: string
  duty: string
  face: string
  dims: Array<keyof CreditVector>
  color: string
}

const FLEET: FleetRole[] = [
  {
    key: 'orchestrator',
    name: '店长 / 调度 Agent',
    duty: '编排各员工 Agent、拆解目标、对齐经营策略',
    face: '内部编排',
    dims: [],
    color: 'var(--color-text)',
  },
  {
    key: 'supply',
    name: '供应链 Agent',
    duty: '采购 / 仓储 / 物流协调 / 补货调度',
    face: '对上游是买家',
    dims: ['timeliness', 'packaging', 'spec'],
    color: 'var(--color-supply)',
  },
  {
    key: 'sales',
    name: '销售 Agent',
    duty: '监听需求 / 生成提案 / 竞价 / 成交',
    face: '对下游是卖家',
    dims: [],
    color: 'var(--color-seller)',
  },
  {
    key: 'service',
    name: '客服 Agent',
    duty: '售后响应 / 退换 / 纠纷处理 / 赔付协商',
    face: '对外是履约方',
    dims: ['afterSales'],
    color: 'var(--color-proposal)',
  },
  {
    key: 'finance',
    name: '财务 Agent',
    duty: '结算 / 对账 / 赔付执行 / 返佣兑付',
    face: '对外是清结算方',
    dims: ['compensation', 'priceStability'],
    color: 'var(--color-fulfil)',
  },
]

const DIM_LABEL: Record<keyof CreditVector, string> = {
  timeliness: '时效履约率',
  spec: '参数符合度',
  afterSales: '售后响应',
  compensation: '赔付履约',
  priceStability: '价格稳定',
  packaging: '包装完好',
}

export function FleetPanel({ seller }: { seller: Agent }) {
  const attestations = useWorld((s) => s.attestations)
  // 归因：找最近一笔违约鉴证，指认到相关员工
  const lastBreach = attestations.find(
    (a) => a.sellerId === seller.id && a.verdict === 'breach',
  )

  return (
    <div className="fleet">
      <div className="fleet-intro">
        一个商家 = 一支员工 Agent 编队。每个员工直接对应 RepChain 的鉴证维度，
        <b>责任可归因、优化有抓手</b>——一笔差评能精确定位到是谁拖了后腿。
      </div>

      <div className="fleet-org">
        {FLEET.map((r) => {
          const culprit =
            lastBreach &&
            r.dims.some((d) => lastBreach.scores[d] < 50)
          return (
            <div
              key={r.key}
              className={`fleet-card ${r.key === 'orchestrator' ? 'lead' : ''} ${
                culprit ? 'culprit' : ''
              }`}
            >
              <div className="fleet-card-head">
                <span
                  className="fleet-dot"
                  style={{ background: r.color }}
                />
                <span className="fleet-name">{r.name}</span>
                <span className="fleet-face">{r.face}</span>
              </div>
              <div className="fleet-duty">{r.duty}</div>
              {r.dims.length > 0 && (
                <div className="fleet-dims">
                  {r.dims.map((d) => (
                    <div key={d} className="fleet-dim">
                      <span className="fleet-dim-label">{DIM_LABEL[d]}</span>
                      <span className="fleet-dim-track">
                        <span
                          className="fleet-dim-fill"
                          style={{
                            width: `${seller.vector[d]}%`,
                            background: r.color,
                          }}
                        />
                      </span>
                      <span className="fleet-dim-val num">
                        {Math.round(seller.vector[d])}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {culprit && <div className="fleet-blame">⚠ 最近违约归因至此</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
