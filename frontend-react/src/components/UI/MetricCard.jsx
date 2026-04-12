export default function MetricCard({
  label,
  value,
  unit,
  sub,
  color = '#00ff88',
  icon,
  compact = false,
  className = '',
}) {
  const padding = compact ? '10px 12px' : '14px 16px'

  return (
    <div
      className={`card ${className}`}
      style={{
        padding,
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? '2px' : '4px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle top border accent */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: color,
          opacity: 0.35,
        }}
      />

      {/* Label row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
        }}
      >
        <span
          style={{
            fontSize: compact ? '0.6rem' : '0.65rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#8899aa',
          }}
        >
          {label}
        </span>
        {icon && (
          <span style={{ fontSize: compact ? '0.8rem' : '1rem', opacity: 0.6 }}>{icon}</span>
        )}
      </div>

      {/* Value */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '4px',
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            fontSize: compact ? '1.1rem' : '1.4rem',
            color,
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontSize: compact ? '0.6rem' : '0.7rem',
              color: '#8899aa',
              fontWeight: 500,
            }}
          >
            {unit}
          </span>
        )}
      </div>

      {/* Sub text */}
      {sub && (
        <span
          style={{
            fontSize: '0.65rem',
            color: '#6a7a8a',
            marginTop: '1px',
          }}
        >
          {sub}
        </span>
      )}
    </div>
  )
}
