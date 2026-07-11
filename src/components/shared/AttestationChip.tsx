import type { Attestation } from '../../core/types'
import './chip.css'

interface Props {
  att: Attestation
  onClick?: () => void
  compact?: boolean
}

export function AttestationChip({ att, onClick, compact }: Props) {
  const cls = att.verdict === 'fulfil' ? 'fulfil' : 'breach'
  return (
    <button
      className={`att-chip ${cls} ${compact ? 'compact' : ''} ${
        att.professional ? 'pro' : ''
      }`}
      onClick={onClick}
      title={`${att.category} · ${att.verdict === 'fulfil' ? '优质履约' : '违约'}`}
    >
      <span className="chip-dot" />
      <span className="chip-score num">{att.overall}</span>
      {!compact && (
        <>
          <span className="chip-cat">{att.category}</span>
          <span className="chip-weight num" title="买家信用加权">
            ×{att.weight >= 100 ? '专业' : att.weight.toFixed(1)}
          </span>
        </>
      )}
    </button>
  )
}
