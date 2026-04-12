import { useState, useEffect, useRef } from 'react'
import { STEG, RISK_COLORS } from '../../constants/grid'

// ─── Analysis Generator ───────────────────────────────────────────────────────
function generateAnalysis(result, params) {
  if (!result) return ''

  const {
    risk_level, risk_score, deficit_mw, headroom_pct,
    total_demand_mw, effective_capacity_mw, renewable_share_pct,
    import_required_mw, drivers,
  } = result

  const isAug14Match = params?.temperature_c >= 44 && params?.demand_delta_pct >= 18
  const headroomMW   = (headroom_pct * effective_capacity_mw / 100).toFixed(0)
  const sections     = []

  // ── Header ──
  if (isAug14Match) {
    sections.push('⚠  SCENARIO MATCH: August 14, 2024 Crisis Pattern')
    sections.push('   Parameters match the conditions that caused Tunisia\'s worst grid event.')
    sections.push('')
  }

  sections.push(`▸  GRID STATUS: ${risk_level}  ·  Risk Score ${risk_score.toFixed(0)} / 100`)
  sections.push('')

  // ── Demand Analysis ──
  sections.push('DEMAND ANALYSIS')
  sections.push(`   Total demand       : ${total_demand_mw.toLocaleString(undefined, { maximumFractionDigits: 0 })} MW`)
  sections.push(`   Effective capacity : ${effective_capacity_mw.toLocaleString(undefined, { maximumFractionDigits: 0 })} MW`)

  if (headroom_pct < 0) {
    sections.push(`   Grid deficit       : ${Math.abs(headroomMW)} MW  →  OVER CAPACITY`)
  } else {
    sections.push(`   Headroom           : +${headroomMW} MW  (${headroom_pct.toFixed(1)}%)`)
  }

  sections.push(`   Renewable share    : ${renewable_share_pct.toFixed(1)}%  (target: 15% by 2027)`)
  sections.push(`   Temperature impact : ${drivers?.temperature_c}°C  →  cooling surge ×${(1 + (drivers?.cooling_surge_factor || 0)).toFixed(3)}`)
  sections.push('')

  // ── Mitigation Strategy ──
  sections.push('MITIGATION STRATEGY')

  if (risk_level === 'CRITICAL') {
    sections.push(`   1. IMMEDIATE   Import ${import_required_mw.toFixed(0)} MW via Algeria–Tunisia Transmed line`)
    sections.push(`   2. ACTIVATE    Industrial load shedding — Tunis, Sfax, Sousse (est. −${(total_demand_mw * 0.12).toFixed(0)} MW)`)
    sections.push(`   3. DEFER       Non-critical loads: commercial HVAC, advertising signage`)
    sections.push(`   4. ALERT       STEG National Dispatch Center — Code Red protocol`)
    sections.push(`   5. DEPLOY      Backup diesel generators at 3 strategic substations`)
    if (isAug14Match) {
      sections.push(`   6. NOTIFY      Ministry of Energy — national emergency declaration`)
    }
  } else if (risk_level === 'HIGH') {
    sections.push(`   1. WARN        Notify large industrial consumers — 20-minute curtailment window`)
    sections.push(`   2. PREPARE     Pre-authorize ${Math.max(50, import_required_mw).toFixed(0)} MW Algeria import request`)
    sections.push(`   3. ACTIVATE    Demand response SMS — notify 50,000 enrolled customers`)
    sections.push(`   4. REDUCE      Lower grid voltage by 3% across northern region (saves ~40 MW)`)
    sections.push(`   5. MONITOR     Increase substation telemetry polling to 5-minute cycle`)
  } else if (risk_level === 'ELEVATED') {
    sections.push(`   1. MONITOR     Enable 15-minute polling on all transmission substations`)
    sections.push(`   2. PREPARE     Pre-position ${(effective_capacity_mw * 0.05).toFixed(0)} MW reserve capacity on standby`)
    sections.push(`   3. OPTIMIZE    Shift deferrable loads to off-peak window (22:00–06:00)`)
    sections.push(`   4. FORECAST    Pull updated wind/solar data for next 6-hour window`)
    sections.push(`   5. COORDINATE  Brief regional grid operators — elevated alert status`)
  } else {
    sections.push(`   Grid operating within safe parameters. Optimization opportunities:`)
    sections.push(`   1. OPTIMIZE    Increase renewable dispatch efficiency`)
    sections.push(`   2. SCHEDULE    Maintenance window for lowest-demand period`)
    sections.push(`   3. INVEST      Renewable share ${renewable_share_pct.toFixed(1)}% → prioritize solar expansion in Tozeur, Sidi Bouzid`)
    sections.push(`   4. EXPORT      Consider selling surplus to Libya via interconnector`)
  }

  sections.push('')

  // ── Projection ──
  sections.push('TIME-HORIZON PROJECTION')
  if (risk_level === 'CRITICAL') {
    sections.push(`   Without intervention : cascading failure in 45–90 minutes`)
    sections.push(`   With Algeria import  : grid stabilization in ~25 minutes`)
    sections.push(`   Load shed scenario  : restore stability in 15 minutes, partial outages`)
  } else if (risk_level === 'HIGH') {
    sections.push(`   Critical window      : next 2–4 hours (afternoon cooling demand peak)`)
    sections.push(`   Re-evaluate          : every 30 minutes until risk drops below HIGH`)
    sections.push(`   Forecast sunset      : relief expected after 19:00 as cooling demand falls`)
  } else if (risk_level === 'ELEVATED') {
    sections.push(`   Stable for now       : current parameters pose no immediate threat`)
    sections.push(`   Watch window         : 12:00–16:00 peak hours — heightened monitoring`)
  } else {
    sections.push(`   Stable              : no intervention required for current projection`)
    sections.push(`   Next review          : standard 24-hour cycle`)
  }

  sections.push('')
  sections.push(`─────────────────────────────────────────────`)
  sections.push(`NoorGrid AI  ·  Based on STEG grid model v1.0  ·  Not a substitute for operator judgment`)

  return sections.join('\n')
}

// ─── Streaming Hook ───────────────────────────────────────────────────────────
function useStreamingText(fullText, speedMs = 10) {
  const [displayed, setDisplayed] = useState('')
  const [isTyping, setIsTyping]   = useState(false)
  const timerRef                  = useRef(null)
  const indexRef                  = useRef(0)

  useEffect(() => {
    if (!fullText) { setDisplayed(''); return }

    clearInterval(timerRef.current)
    setDisplayed('')
    setIsTyping(true)
    indexRef.current = 0

    timerRef.current = setInterval(() => {
      indexRef.current += 3 // advance 3 chars per tick for snappy feel
      if (indexRef.current >= fullText.length) {
        setDisplayed(fullText)
        setIsTyping(false)
        clearInterval(timerRef.current)
      } else {
        setDisplayed(fullText.slice(0, indexRef.current))
      }
    }, speedMs)

    return () => clearInterval(timerRef.current)
  }, [fullText, speedMs])

  return { displayed, isTyping }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AIAdvisor({ result, params, isReplay }) {
  const fullText          = result ? generateAnalysis(result, params) : ''
  const { displayed, isTyping } = useStreamingText(fullText, 8)
  const riskColor         = result ? (RISK_COLORS[result.risk_level] || '#00ff88') : '#00ff88'
  const scrollRef         = useRef(null)

  // Auto-scroll to bottom as text streams in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [displayed])

  return (
    <div
      style={{
        background: 'rgba(6, 10, 20, 0.85)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${riskColor}28`,
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: `0 0 40px ${riskColor}08, inset 0 1px 0 ${riskColor}15`,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: `1px solid ${riskColor}18`,
          background: `linear-gradient(90deg, ${riskColor}08 0%, transparent 100%)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* AI icon */}
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: `linear-gradient(135deg, ${riskColor}22, ${riskColor}08)`,
              border: `1px solid ${riskColor}35`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.9rem',
            }}
          >
            ◈
          </div>
          <div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.72rem',
                fontWeight: 700,
                color: riskColor,
                letterSpacing: '0.06em',
              }}
            >
              NoorGrid AI Advisor
            </div>
            <div style={{ fontSize: '0.58rem', color: '#8899aa', marginTop: '1px' }}>
              Grid intelligence engine · STEG model v1.0
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isReplay && (
            <span
              style={{
                fontSize: '0.58rem',
                fontWeight: 700,
                color: '#ff3333',
                background: 'rgba(255,51,51,0.1)',
                border: '1px solid rgba(255,51,51,0.25)',
                borderRadius: '3px',
                padding: '2px 6px',
                letterSpacing: '0.06em',
              }}
            >
              AUG 14 2024
            </span>
          )}
          {result && (
            <span
              style={{
                fontSize: '0.58rem',
                fontWeight: 700,
                color: riskColor,
                background: `${riskColor}10`,
                border: `1px solid ${riskColor}30`,
                borderRadius: '3px',
                padding: '2px 6px',
                letterSpacing: '0.06em',
              }}
            >
              {result.risk_level}
            </span>
          )}
          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div className="live-dot" style={{ background: riskColor, boxShadow: `0 0 6px ${riskColor}` }} />
              <span style={{ fontSize: '0.58rem', color: riskColor, letterSpacing: '0.08em' }}>ANALYZING</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div
        ref={scrollRef}
        style={{
          padding: '14px 16px',
          minHeight: '180px',
          maxHeight: '320px',
          overflowY: 'auto',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.72rem',
          lineHeight: 1.75,
          color: '#c8d8e8',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {!result ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '120px',
              gap: '8px',
              color: '#4a5568',
            }}
          >
            <span style={{ fontSize: '1.4rem', opacity: 0.4 }}>◈</span>
            <span style={{ fontSize: '0.7rem' }}>Run a simulation to activate AI analysis</span>
          </div>
        ) : (
          <>
            {/* Colorize specific lines */}
            {displayed.split('\n').map((line, i) => {
              const isHeader  = line.startsWith('▸') || line.startsWith('⚠')
              const isSection = /^[A-Z\s]{5,}$/.test(line.trim()) && line.trim().length > 0 && !line.includes(':')
              const isCritical = line.includes('CRITICAL') || line.includes('IMMEDIATE') || line.includes('EMERGENCY') || line.includes('ALERT')
              const isGood    = line.includes('Stable') || line.includes('no intervention') || line.includes('OPTIMIZE')
              const isSep     = line.startsWith('─')
              const isFooter  = line.startsWith('NoorGrid AI')

              return (
                <div
                  key={i}
                  style={{
                    color: isSep || isFooter ? '#2a3a4a'
                         : isHeader     ? riskColor
                         : isSection    ? '#06b6d4'
                         : isCritical   ? '#ff6666'
                         : isGood       ? '#00ff88'
                         : '#c8d8e8',
                    fontWeight: isHeader || isSection ? 700 : 400,
                    marginTop: isSection ? '4px' : 0,
                  }}
                >
                  {line || '\u00A0'}
                </div>
              )
            })}
            {/* Blinking cursor */}
            {isTyping && (
              <span
                style={{
                  display: 'inline-block',
                  width: '7px',
                  height: '13px',
                  background: riskColor,
                  verticalAlign: 'text-bottom',
                  animation: 'blink 0.7s step-end infinite',
                  borderRadius: '1px',
                }}
              />
            )}
          </>
        )}
      </div>

      {/* ── Footer ── */}
      {result && !isTyping && (
        <div
          style={{
            padding: '8px 16px',
            borderTop: `1px solid ${riskColor}10`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '0.58rem', color: '#4a5568' }}>
            Powered by STEG capacity model · OpenMeteo weather data
          </span>
          <span
            style={{
              fontSize: '0.58rem',
              color: '#4a5568',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      )}
    </div>
  )
}
