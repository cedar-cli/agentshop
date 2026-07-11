import { useMemo } from 'react'
import { useWorld } from '../../core/store'
import { CREDIT_DIMS, type Agent } from '../../core/types'
import { sellerAttestations } from '../../core/selectors'
import './credittree.css'

const W = 360
const H = 380
const CX = W / 2
const BASE_Y = H - 30

export function CreditTree({ seller }: { seller: Agent }) {
  const attestations = useWorld((s) => s.attestations)
  const riskEvents = useWorld((s) => s.riskEvents)
  const injectRisk = useWorld((s) => s.injectRisk)

  const brushing = riskEvents.some(
    (r) => r.targetId === seller.id && r.kind === 'brush' && !r.resolved,
  )
  const withered = seller.flagged

  const atts = sellerAttestations(attestations, seller.id)
  const fruits = atts.filter(
    (a) => a.verdict === 'fulfil' && (a.professional || a.weight >= 2.2),
  ).length

  const branches = useMemo(() => {
    const n = CREDIT_DIMS.length
    return CREDIT_DIMS.map((d, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1)
      const angle = (-72 + t * 144) * (Math.PI / 180)
      const len = 70 + (seller.vector[d.key] / 100) * 70
      const trunkTopY = BASE_Y - 130
      const ex = CX + Math.sin(angle) * len
      const ey = trunkTopY - Math.cos(angle) * len
      const leaves = Math.round(seller.vector[d.key] / 11)
      return { key: d.key, label: d.short, angle, len, ex, ey, leaves, score: seller.vector[d.key] }
    })
  }, [seller.vector])

  const trunkTopY = BASE_Y - 130
  const trunkW = 10 + (seller.credit / 100) * 26

  return (
    <div className="credit-tree">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={withered ? 'wither' : ''}>
        {/* 地下信用链网络 */}
        <line x1={40} y1={BASE_Y} x2={W - 40} y2={BASE_Y} className="ct-ground" />
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={i}
            x1={CX}
            y1={BASE_Y}
            x2={60 + i * 60}
            y2={H - 6}
            className="ct-root"
          />
        ))}
        <text x={CX} y={H - 2} className="ct-root-label" textAnchor="middle">
          RepChain 信用链网络
        </text>

        {/* 树干 */}
        <path
          d={`M ${CX - trunkW / 2} ${BASE_Y}
              Q ${CX - trunkW / 2 - 4} ${(BASE_Y + trunkTopY) / 2} ${CX - trunkW / 4} ${trunkTopY}
              L ${CX + trunkW / 4} ${trunkTopY}
              Q ${CX + trunkW / 2 + 4} ${(BASE_Y + trunkTopY) / 2} ${CX + trunkW / 2} ${BASE_Y} Z`}
          className="ct-trunk"
        />

        {/* 枝干 + 叶 */}
        {branches.map((b) => (
          <g key={b.key} className={b.score < 40 ? 'ct-branch-weak' : ''}>
            <line
              x1={CX}
              y1={trunkTopY}
              x2={b.ex}
              y2={b.ey}
              className="ct-branch"
              strokeWidth={2 + (b.score / 100) * 3}
            />
            {Array.from({ length: b.leaves }, (_, li) => {
              const lt = (li + 1) / (b.leaves + 1)
              const lx = CX + (b.ex - CX) * lt
              const ly = trunkTopY + (b.ey - trunkTopY) * lt
              const jitter = ((li * 37) % 14) - 7
              return (
                <circle
                  key={li}
                  cx={lx + jitter}
                  cy={ly + (((li * 53) % 12) - 6)}
                  r={3.2}
                  className="ct-leaf"
                  style={{ animationDelay: `${li * 40}ms` }}
                />
              )
            })}
            <text x={b.ex} y={b.ey - 8} className="ct-branch-label" textAnchor="middle">
              {b.label}
            </text>
          </g>
        ))}

        {/* 果实（高权重优质鉴证） */}
        {Array.from({ length: Math.min(fruits, 8) }, (_, i) => {
          const a = (i / 8) * Math.PI * 2
          const rr = 60
          return (
            <circle
              key={i}
              cx={CX + Math.cos(a) * rr}
              cy={trunkTopY - 40 + Math.sin(a) * rr * 0.6}
              r={4}
              className="ct-fruit"
            />
          )
        })}

        {/* 刷分假叶 */}
        {brushing &&
          Array.from({ length: 26 }, (_, i) => {
            const a = (i / 26) * Math.PI * 2
            const rr = 40 + ((i * 17) % 60)
            return (
              <circle
                key={`fake-${i}`}
                cx={CX + Math.cos(a) * rr}
                cy={trunkTopY - 30 + Math.sin(a) * rr * 0.5}
                r={3}
                className="ct-fake-leaf"
              />
            )
          })}
      </svg>

      <div className="ct-side">
        <div className="ct-stat">
          <span className="num">{seller.credit}</span>
          <span>树干 · 基础信用分</span>
        </div>
        <div className="ct-stat">
          <span className="num">{fruits}</span>
          <span>果实 · 高权重优质鉴证</span>
        </div>
        {withered ? (
          <div className="ct-status bad">
            假叶枯萎 · 树干变黑 · 全网准入降级。唯一修复途径：优化后续履约。
          </div>
        ) : brushing ? (
          <div className="ct-status warn">
            检测到刷分假叶 · 信用链校验中…（数秒后枯萎脱落）
          </div>
        ) : (
          <div className="ct-status ok">
            每笔优质履约长一片新叶，专业认证开金花；违约掉叶。
          </div>
        )}
        <button
          className="ct-brush-btn"
          onClick={() => injectRisk('brush', seller.id)}
          disabled={brushing || withered}
        >
          模拟刷分
        </button>
      </div>
    </div>
  )
}
