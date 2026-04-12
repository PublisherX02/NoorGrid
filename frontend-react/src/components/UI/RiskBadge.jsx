import { RISK_COLORS, RISK_BG, RISK_BORDER } from '../../constants/grid'

export default function RiskBadge({ level, size = 'sm', showDot = true }) {
  if (!level) return null
  const color  = RISK_COLORS[level] || '#8899aa'
  const bg     = RISK_BG[level]    || 'transparent'
  const border = RISK_BORDER[level] || 'rgba(136,153,170,0.3)'

  const sizes = {
    xs: { fontSize: '0.55rem', padding: '1px 5px' },
    sm: { fontSize: '0.62rem', padding: '2px 7px' },
    md: { fontSize: '0.7rem',  padding: '3px 9px' },
    lg: { fontSize: '0.8rem',  padding: '4px 12px' },
  }

  const s = sizes[size] || sizes.sm

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        borderRadius: '4px',
        border: `1px solid ${border}`,
        background: bg,
        color,
        ...s,
        whiteSpace: 'nowrap',
      }}
    >
      {showDot && (
        <span
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
            boxShadow: `0 0 4px ${color}`,
          }}
        />
      )}
      {level}
    </span>
  )
}
