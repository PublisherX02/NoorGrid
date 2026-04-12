// SVG-based semicircular gauge for Carbon Index
export default function GaugeChart({ value, max = 4, label = '', unit = '', color = '#00ff88' }) {
  const pct    = Math.min(1, Math.max(0, value / max))
  const radius = 60
  const cx     = 80
  const cy     = 75
  const startAngle = -180
  const endAngle   = 0
  const sweepAngle = endAngle - startAngle

  const toXY = (angleDeg, r) => {
    const rad = (angleDeg * Math.PI) / 180
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    }
  }

  const valueAngle = startAngle + sweepAngle * pct

  // Track arc
  const trackStart = toXY(startAngle, radius)
  const trackEnd   = toXY(endAngle, radius)

  // Value arc
  const valueEnd = toXY(valueAngle, radius)
  const largeArc = sweepAngle * pct > 180 ? 1 : 0

  // Needle
  const needle = toXY(valueAngle, radius - 10)

  // Tick marks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const angle = startAngle + sweepAngle * t
    const outer = toXY(angle, radius + 4)
    const inner = toXY(angle, radius - 4)
    return { outer, inner, t }
  })

  return (
    <svg viewBox="0 0 160 85" width="100%" style={{ maxWidth: '200px', display: 'block', margin: '0 auto' }}>
      {/* Background track */}
      <path
        d={`M ${trackStart.x} ${trackStart.y} A ${radius} ${radius} 0 0 1 ${trackEnd.x} ${trackEnd.y}`}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Value arc */}
      <path
        d={`M ${trackStart.x} ${trackStart.y} A ${radius} ${radius} 0 ${largeArc} 1 ${valueEnd.x} ${valueEnd.y}`}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />

      {/* Tick marks */}
      {ticks.map(({ outer, inner, t }) => (
        <line
          key={t}
          x1={outer.x} y1={outer.y}
          x2={inner.x} y2={inner.y}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1.5"
        />
      ))}

      {/* Needle */}
      <circle cx={cx} cy={cy} r="4" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      <line
        x1={cx} y1={cy}
        x2={needle.x} y2={needle.y}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Value text */}
      <text
        x={cx} y={cy - 14}
        textAnchor="middle"
        fontFamily="'JetBrains Mono', monospace"
        fontSize="13"
        fontWeight="700"
        fill={color}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      >
        {typeof value === 'number' ? value.toFixed(2) : value}
      </text>
      <text
        x={cx} y={cy - 3}
        textAnchor="middle"
        fontFamily="'Inter', sans-serif"
        fontSize="6.5"
        fill="rgba(136,153,170,0.8)"
      >
        {unit}
      </text>

      {/* Min / Max labels */}
      <text x="14" y={cy + 14} textAnchor="middle" fontSize="7" fill="rgba(136,153,170,0.6)" fontFamily="'JetBrains Mono', monospace">0</text>
      <text x={cx * 2 - 14} y={cy + 14} textAnchor="middle" fontSize="7" fill="rgba(136,153,170,0.6)" fontFamily="'JetBrains Mono', monospace">{max}</text>

      {/* Label */}
      {label && (
        <text
          x={cx} y={cy + 12}
          textAnchor="middle"
          fontFamily="'Inter', sans-serif"
          fontSize="7"
          fontWeight="600"
          fill="rgba(136,153,170,0.7)"
          letterSpacing="0.08em"
          textDecoration="none"
          style={{ textTransform: 'uppercase' }}
        >
          {label}
        </text>
      )}
    </svg>
  )
}
