import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChatWidget } from '../components/AI/STEGChatbot'
import TunisiaMap from '../components/Map/TunisiaMap'
import RiskBadge from '../components/UI/RiskBadge'
import GaugeChart from '../components/UI/GaugeChart'
import { useWeather } from '../hooks/useWeather'
import { useBlackout } from '../hooks/useBlackout'
import { getHydroForecast, predictBlackout } from '../services/api'
import {
  GOVERNORATES, STEG, RISK_COLORS, RISK_ORDER, SOURCE_ICON, SOURCE_COLOR, NATIONAL_CARBON_INDEX,
} from '../constants/grid'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useAlerts } from '../hooks/useAlerts'
import CrisisModal from '../components/Crisis/CrisisModal'
import AlertFeed from '../components/Crisis/AlertFeed'
import DiagnosisReportModal from '../components/Crisis/DiagnosisReportModal'
import { useCrisisReport } from '../hooks/useCrisisReport'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'


// ─── Tunisia Clock ──────────────────────────────────────────────────────────
function TunisiaClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const tunis = new Intl.DateTimeFormat(locale, {
    timeZone: 'Africa/Tunis',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(time)
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: 'Africa/Tunis',
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(time)

  return (
    <div style={{ marginBottom: '16px' }}>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '1.5rem',
          fontWeight: 700,
          color: '#00ff88',
          letterSpacing: '0.04em',
          lineHeight: 1,
          textShadow: '0 0 16px rgba(0,255,136,0.35)',
        }}
      >
        {tunis}
      </div>
      <div style={{ fontSize: '0.65rem', color: '#8899aa', marginTop: '3px' }}>{date} · TUN</div>
    </div>
  )
}

// ─── Mini Bar Chart (right panel) ──────────────────────────────────────────
function ConsumptionChart({ govs }) {
  const data = govs.slice(0, 8).map((g) => ({
    name: g.name.slice(0, 4),
    consumption: g.baseline_mw,
    renewable: g.mock_mw,
  }))
  return (
    <ResponsiveContainer width="100%" height={90}>
      <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -20 }} barSize={6} barGap={1}>
        <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#8899aa' }} axisLine={false} tickLine={false} />
        <YAxis tick={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: '#0d1526', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#e2e8f0' }}
          itemStyle={{ color: '#8899aa' }}
        />
        <Bar dataKey="consumption" fill="rgba(255,255,255,0.1)" radius={[2, 2, 0, 0]} name="Demand MW" />
        <Bar dataKey="renewable" fill="#00ff88" radius={[2, 2, 0, 0]} name="Output MW">
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.renewable / entry.consumption < 0.7 ? '#ff9500' : '#00ff88'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Gov Card (right panel) ─────────────────────────────────────────────────
function GovCard({ gov, effectiveRisk, outputMw }) {
  const risk  = effectiveRisk || gov.mock_risk
  const color = RISK_COLORS[risk] || '#00ff88'
  return (
    <div
      style={{
        background: '#0d1526',
        border: `1px solid ${color}22`,
        borderRadius: '6px',
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#e2e8f0' }}>{gov.name}</span>
        <RiskBadge level={risk} size="xs" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '0.65rem', color: '#8899aa' }}>
          {SOURCE_ICON[gov.source]} {gov.source}
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.7rem',
            fontWeight: 600,
            color,
            marginLeft: 'auto',
          }}
        >
          {outputMw ?? gov.mock_mw} MW
        </span>
      </div>
    </div>
  )
}

// ─── Governorate Stats Panel (right panel) ─────────────────────────────────
function StatCell({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: '0.58rem', color: '#8899aa', marginBottom: '2px' }}>{label}</div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.78rem',
          fontWeight: 700,
          color: color || '#e2e8f0',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function GovernorateStats({ gov, risk, outputMw, hydroIndicator }) {
  const { t } = useTranslation()
  const riskColor = RISK_COLORS[risk] || '#00ff88'
  const srcColor  = SOURCE_COLOR[gov.source] || '#00ff88'
  const srcIcon   = SOURCE_ICON[gov.source] || '⚡'

  const liveOutput = outputMw ?? gov.mock_mw
  const coveragePct = gov.avg_demand_mw
    ? Math.min((liveOutput / gov.avg_demand_mw) * 100, 150)
    : null
  const utilizationPct = gov.installed_capacity_mw
    ? Math.min((liveOutput / gov.installed_capacity_mw) * 100, 100)
    : null

  return (
    <div>
      <div className="section-label" style={{ marginBottom: '6px' }}>
        {gov.name} — {t('dashboard.stationDetails')}
      </div>
      <div
        className="card-panel"
        style={{
          padding: '10px 12px',
          borderColor: `${riskColor}30`,
          background: `linear-gradient(135deg, ${riskColor}04 0%, transparent 100%)`,
        }}
      >
        {/* Source header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: `${srcColor}15`,
                border: `1px solid ${srcColor}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                flexShrink: 0,
              }}
            >
              {srcIcon}
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: srcColor }}>
                {gov.source} — {t('dashboard.energy')}
              </div>
              <div style={{ fontSize: '0.58rem', color: '#8899aa', marginTop: '1px' }}>
                {gov.region}
                {gov.hasBackend && (
                  <span style={{ color: '#00ff88', marginLeft: '4px' }}>· {t('dashboard.liveSource')}</span>
                )}
              </div>
            </div>
          </div>
          <RiskBadge level={risk} size="xs" />
        </div>

        {/* 4-cell stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <StatCell
            label={t('dashboard.liveOutput')}
            value={`${liveOutput} MW`}
            color={riskColor}
          />
          <StatCell
            label={t('dashboard.installedCapacity')}
            value={`${gov.installed_capacity_mw ?? '—'} MW`}
            color="#e2e8f0"
          />
          <StatCell
            label={t('dashboard.avgDemand')}
            value={`${gov.avg_demand_mw ?? '—'} MW`}
            color="#8899aa"
          />
          <StatCell
            label={t('dashboard.peakDemand')}
            value={`${gov.peak_demand_mw ?? '—'} MW`}
            color="#ff9500"
          />
        </div>

        {/* Output vs Demand bar */}
        {coveragePct !== null && (
          <div style={{ marginBottom: '6px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: '3px',
              }}
            >
              <span style={{ fontSize: '0.58rem', color: '#8899aa' }}>{t('dashboard.outputVsAvgDemand')}</span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: coveragePct >= 100 ? '#00ff88' : riskColor,
                }}
              >
                {coveragePct.toFixed(1)}%
              </span>
            </div>
            <div
              style={{
                height: '3px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(coveragePct, 100)}%`,
                  background: coveragePct >= 100 ? '#00ff88' : riskColor,
                  borderRadius: '2px',
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Utilization bar */}
        {utilizationPct !== null && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: '3px',
              }}
            >
              <span style={{ fontSize: '0.58rem', color: '#8899aa' }}>{t('dashboard.capacityUtilization')}</span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: srcColor,
                }}
              >
                {utilizationPct.toFixed(1)}%
              </span>
            </div>
            <div
              style={{
                height: '3px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${utilizationPct}%`,
                  background: srcColor,
                  borderRadius: '2px',
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>
        )}

        {gov.name === 'Béja' && hydroIndicator && (
          <div
            style={{
              marginTop: '10px',
              paddingTop: '8px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              fontSize: '0.62rem',
              color: '#8899aa',
              lineHeight: 1.5,
            }}
          >
            📈 12-month avg forecast: <span style={{ color: '#06b6d4', fontFamily: "'JetBrains Mono', monospace" }}>{hydroIndicator.avgForecastMw.toFixed(2)} MW</span>
            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.15)' }}>|</span>
            Next drought risk: <span style={{ color: hydroIndicator.nextDroughtMonth ? '#ff3333' : '#00ff88', fontFamily: "'JetBrains Mono', monospace" }}>{hydroIndicator.nextDroughtMonth || 'None detected'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Peak risk level from a predictions array
function peakRiskLevel(preds) {
  if (!preds?.length) return null
  return preds.reduce(
    (best, p) => (RISK_ORDER[p.risk_level] || 0) > (RISK_ORDER[best.risk_level] || 0) ? p : best
  ).risk_level
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { weatherMap, loading: wLoading, isMock, backendOnline } = useWeather()
  const { predictions, region: blackoutRegion, fetchPrediction, peakWindow, loading: bLoading } = useBlackout()
  const [selectedGov, setSelectedGov] = useState(null)
  // liveRiskMap: { [govName]: risk_level } — populated from blackout predictions
  const [liveRiskMap, setLiveRiskMap] = useState({})
  const [hydroIndicator, setHydroIndicator] = useState(null)

  const { t } = useTranslation()

  const { alerts, loading: alertLoading, error: alertError, triggerSimulation } = useAlerts(backendOnline === true)
  const [activeAlert, setActiveAlert]     = useState(null)
  const [cascadeAlerts, setCascadeAlerts] = useState([])
  const [showCrisisModal, setShowCrisisModal] = useState(false)
  const {
    reportStatus,
    report,
    openReport,
    setOpenReport,
    onDronesReturned,
    retryReport,
    defaultRecipients,
  } = useCrisisReport({ activeAlert, cascadeAlerts })

  const handleAlertTriggered = (alert, cascadeRegions = []) => {
    setActiveAlert(alert)
    setCascadeAlerts(cascadeRegions)
  }

  const handleAcknowledge = () => {
    setActiveAlert(null)
    setCascadeAlerts([])
  }


  // Helpers: weatherMap is the primary live source; liveRiskMap from blackout predictions is secondary
  const effectiveRisk = useCallback(
    (gov) => weatherMap[gov.name]?.risk_level || liveRiskMap[gov.name] || gov.mock_risk,
    [weatherMap, liveRiskMap]
  )

  const effectiveOutput = useCallback(
    (gov) => weatherMap[gov.name]?.output_mw ?? gov.mock_mw,
    [weatherMap]
  )

  // Pre-fetch predictions only when backend is confirmed online.
  useEffect(() => {
    if (backendOnline !== true) return
    GOVERNORATES.filter((g) => g.hasBackend).forEach(async (gov) => {
      try {
        const res = await predictBlackout(gov.name, 24)
        const level = peakRiskLevel(res.data?.predictions)
        if (level) setLiveRiskMap((prev) => ({ ...prev, [gov.name]: level }))
      } catch {}
    })
  }, [backendOnline])

  // Sync liveRiskMap when a new prediction comes in for the selected gov
  useEffect(() => {
    if (predictions && selectedGov && blackoutRegion === selectedGov.name) {
      const level = peakRiskLevel(predictions)
      if (level) setLiveRiskMap((prev) => ({ ...prev, [selectedGov.name]: level }))
    }
  }, [predictions, selectedGov, blackoutRegion])

  useEffect(() => {
    if (backendOnline !== true) return
    let active = true
    getHydroForecast(12).then((res) => {
      if (!active || !res?.data?.predictions?.length) return
      const predictionsData = res.data.predictions
      const avgForecastMw = predictionsData.reduce((sum, item) => sum + Number(item.predicted_mw || 0), 0) / predictionsData.length
      const nextDroughtMonth = predictionsData.find((item) => item.risk === 'DROUGHT_RISK')?.month || null
      setHydroIndicator({ avgForecastMw, nextDroughtMonth })
    })
    return () => {
      active = false
    }
  }, [backendOnline])

  // Load default blackout prediction on mount
  useEffect(() => {
    if (backendOnline !== true) return
    fetchPrediction('Bizerte', 24)
  }, [backendOnline, fetchPrediction])

  const handleSelectGov = (gov) => {
    setSelectedGov(gov)
    if (backendOnline === true && gov.hasBackend) fetchPrediction(gov.name, 24)
  }

  const totalMW     = GOVERNORATES.reduce((a, g) => a + effectiveOutput(g), 0).toFixed(0)
  const carbonIndex = NATIONAL_CARBON_INDEX.value

  // Sidebar risk groups — use live risk where available
  const criticalGovs = GOVERNORATES.filter((g) => effectiveRisk(g) === 'CRITICAL')
  const highGovs     = GOVERNORATES.filter((g) => effectiveRisk(g) === 'HIGH')
  const otherGovs    = GOVERNORATES.filter((g) => !['CRITICAL', 'HIGH'].includes(effectiveRisk(g)))
  const anomalies    = criticalGovs.length + highGovs.length

  return (
    <div className="ops-room">

      {/* ── Top Bar ──────────────────────────────────────────────────── */}
      <div
        style={{
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid rgba(0,255,136,0.1)',
          background: 'rgba(10,15,26,0.95)',
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              fontSize: '0.85rem',
              color: '#00ff88',
              letterSpacing: '0.05em',
            }}
          >
            <img
              src="/channels4_profile.jpg"
              alt="STEG"
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                objectFit: 'cover',
                border: '1px solid rgba(0,255,136,0.25)',
              }}
            />
            NoorGrid
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="live-dot" />
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#00ff88', letterSpacing: '0.12em' }}>
              {t('status.live')}
            </span>
          </div>
          {isMock && (
            <span
              style={{
                fontSize: '0.58rem',
                color: '#ff9500',
                background: 'rgba(255,149,0,0.1)',
                border: '1px solid rgba(255,149,0,0.25)',
                borderRadius: '3px',
                padding: '1px 6px',
                fontWeight: 600,
                letterSpacing: '0.06em',
              }}
            >
              {t('status.simulated')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {[
            { label: t('status.backend'), online: backendOnline },
            { label: t('status.weatherApi'), online: !isMock },
            { label: t('status.predictionEngine'), online: true },
          ].map(({ label, online }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                background: online ? 'rgba(0,255,136,0.06)' : 'rgba(255,51,51,0.06)',
                border: `1px solid ${online ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,51,0.2)'}`,
                borderRadius: '3px',
                fontSize: '0.58rem',
                fontWeight: 600,
                color: online ? '#00ff88' : '#ff3333',
                letterSpacing: '0.04em',
              }}
            >
              <span
                style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: online ? '#00ff88' : '#ff3333',
                  flexShrink: 0,
                }}
              />
              {label}
            </div>
          ))}
          <button
            onClick={() => setShowCrisisModal(true)}
            style={{
              background: activeAlert ? 'rgba(255,51,51,0.15)' : 'rgba(255,51,51,0.06)',
              border: `1px solid ${activeAlert ? 'rgba(255,51,51,0.6)' : 'rgba(255,51,51,0.25)'}`,
              borderRadius: '4px',
              padding: '2px 10px',
              fontSize: '0.65rem',
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              color: '#ff3333',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              animation: activeAlert ? 'none' : 'livePulse 1.8s ease-in-out infinite',
            }}
          >
            {t('crisis.simulateButton') || '⚡ SIMULATE CRISIS'}
          </button>
          <button
            onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'fr' : 'en')}
            style={{
              background: 'none',
              border: '1px solid rgba(0,255,136,0.2)',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '0.65rem',
              color: '#00ff88',
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            {i18n.language === 'en' ? 'FR' : 'EN'}
          </button>
          <div style={{ display: 'flex', gap: '2px', marginLeft: '8px' }}>
            {[
              { label: t('nav.analytics'), path: '/analytics' },
              { label: t('nav.simulation'), path: '/simulation' },
              { label: t('nav.crisisIntel'), path: '/crisis-intelligence' },
              { label: t('nav.about'), path: '/about' },
            ].map(({ label, path }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                style={{
                  background: 'none',
                  border: '1px solid rgba(0,255,136,0.12)',
                  borderRadius: '4px',
                  padding: '2px 10px',
                  fontSize: '0.65rem',
                  color: '#8899aa',
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 500,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.target.style.color = '#00ff88'; e.target.style.borderColor = 'rgba(0,255,136,0.3)' }}
                onMouseLeave={(e) => { e.target.style.color = '#8899aa'; e.target.style.borderColor = 'rgba(0,255,136,0.12)' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="ops-body">

        {/* ── LEFT PANEL ──────────────────────────────────────────── */}
        <div
          style={{
            width: '220px',
            flexShrink: 0,
            borderRight: '1px solid rgba(0,255,136,0.1)',
            padding: '14px 12px',
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <TunisiaClock />

          {/* Grid Overview */}
          <div>
            <div className="section-label">{t('dashboard.gridOverview')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div className="card-panel" style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: '0.58rem', color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {t('dashboard.totalOutput')}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.15rem', fontWeight: 700, color: '#00ff88', marginTop: '2px' }}>
                  {totalMW} <span style={{ fontSize: '0.65rem', fontWeight: 400 }}>MW</span>
                </div>
              </div>
              <div className="card-panel" style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: '0.58rem', color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {t('dashboard.activeAnomalies')}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.15rem', fontWeight: 700, color: anomalies > 0 ? '#ff3333' : '#00ff88', marginTop: '2px' }}>
                  {anomalies}
                  <span style={{ fontSize: '0.6rem', color: '#8899aa', marginLeft: '4px' }}>{t('dashboard.regions')}</span>
                </div>
              </div>
              <div className="card-panel" style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: '0.58rem', color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {t('dashboard.carbonIndex')}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.15rem', fontWeight: 700, color: '#06b6d4', marginTop: '2px' }}>
                  {carbonIndex} <span style={{ fontSize: '0.55rem', fontWeight: 400 }}>kg/cap</span>
                </div>
              </div>
            </div>
          </div>

          {/* Governorate Selector */}
          <div style={{ flex: 1 }}>
            <div className="section-label">{t('dashboard.governorates')}</div>

            {criticalGovs.length > 0 && (
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '0.55rem', color: '#ff3333', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '4px' }}>
                  ● {t('risk.CRITICAL')}
                </div>
                {criticalGovs.map((g) => (
                  <button
                    key={g.name}
                    className={`gov-btn ${selectedGov?.name === g.name ? 'active' : ''}`}
                    onClick={() => handleSelectGov(g)}
                  >
                    <span style={{ fontSize: '0.72rem' }}>{g.name}</span>
                    <RiskBadge level={effectiveRisk(g)} size="xs" showDot={false} />
                  </button>
                ))}
              </div>
            )}

            {highGovs.length > 0 && (
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '0.55rem', color: '#ff9500', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '4px' }}>
                  ● {t('risk.HIGH')}
                </div>
                {highGovs.map((g) => (
                  <button
                    key={g.name}
                    className={`gov-btn ${selectedGov?.name === g.name ? 'active' : ''}`}
                    onClick={() => handleSelectGov(g)}
                  >
                    <span style={{ fontSize: '0.72rem' }}>{g.name}</span>
                    <RiskBadge level={effectiveRisk(g)} size="xs" showDot={false} />
                  </button>
                ))}
              </div>
            )}

            <div>
              <div style={{ fontSize: '0.55rem', color: '#8899aa', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '4px' }}>
                ● {t('risk.NOMINAL')} / {t('risk.ELEVATED')}
              </div>
              {otherGovs.map((g) => (
                <button
                  key={g.name}
                  className={`gov-btn ${selectedGov?.name === g.name ? 'active' : ''}`}
                  onClick={() => handleSelectGov(g)}
                >
                  <span style={{ fontSize: '0.72rem' }}>{g.name}</span>
                  <RiskBadge level={effectiveRisk(g)} size="xs" showDot={false} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── CENTER PANEL (Map) ───────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {/* Center header */}
          <div
            style={{
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              borderBottom: '1px solid rgba(0,255,136,0.08)',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#00ff88',
                opacity: 0.7,
              }}
            >
              {t('dashboard.operationsCenter')}
            </span>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {[
                { color: '#ff3333', label: t('risk.CRITICAL') },
                { color: '#ff9500', label: t('risk.HIGH') },
                { color: '#ffd700', label: t('risk.ELEVATED') },
                { color: '#00ff88', label: t('risk.NOMINAL') },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
                  <span style={{ fontSize: '0.6rem', color: '#8899aa' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Map */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            {wLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '12px' }}>
                <div className="spinner" style={{ width: '32px', height: '32px' }} />
                <span style={{ fontSize: '0.75rem', color: '#8899aa' }}>{t('dashboard.loadingGridData')}</span>
              </div>
            ) : (
              <TunisiaMap
                weatherMap={weatherMap}
                selectedGov={selectedGov}
                onSelectGov={handleSelectGov}
                liveRiskMap={liveRiskMap}
                activeAlert={activeAlert}
                cascadeAlerts={cascadeAlerts}
                droneState={{ onDronesReturned }}
                style={{ height: '100%', width: '100%' }}
              />
            )}
          </div>

          {/* Bottom stats bar */}
          <div
            style={{
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              padding: '0 16px',
              borderTop: '1px solid rgba(0,255,136,0.08)',
              background: 'rgba(10,15,26,0.8)',
              flexShrink: 0,
              flexWrap: 'wrap',
              overflow: 'hidden',
            }}
          >
            {[
              { label: t('dashboard.capacity'), value: `${STEG.EFFECTIVE_CAPACITY_MW.toLocaleString()} MW`, color: '#00ff88' },
              { label: t('dashboard.recordPeak'), value: `${STEG.RECORD_PEAK_MW.toLocaleString()} MW`, color: '#ff3333' },
              { label: t('dashboard.gridLosses'), value: `${STEG.GRID_LOSSES_PCT}%`, color: '#ff9500' },
              { label: t('dashboard.algeriaBuffer'), value: `${STEG.ALGERIA_DEFICIT_MW} MW`, color: '#ffd700' },
              { label: t('dashboard.renewableShare'), value: `${STEG.RENEWABLE_PCT}%`, color: '#06b6d4' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '0.58rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', fontWeight: 700, color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
        <div
          style={{
            width: '260px',
            flexShrink: 0,
            borderLeft: '1px solid rgba(0,255,136,0.1)',
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '12px 10px',
          }}
        >
          {/* Header */}
          <div className="section-label" style={{ marginBottom: 0 }}>{t('dashboard.gridState')}</div>

          {/* Gov Cards grid — highest-risk governorates, using live risk */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {GOVERNORATES
              .filter((g) => ['CRITICAL', 'HIGH', 'ELEVATED'].includes(effectiveRisk(g)))
              .sort((a, b) => (RISK_ORDER[effectiveRisk(b)] || 0) - (RISK_ORDER[effectiveRisk(a)] || 0))
              .slice(0, 6)
              .map((g) => (
                <GovCard key={g.name} gov={g} effectiveRisk={effectiveRisk(g)} outputMw={effectiveOutput(g)} />
              ))}
          </div>

          {/* Consumption vs Renewable Chart */}
          <div>
            <div className="section-label">{t('dashboard.demandVsProduction')} (MW)</div>
            <div className="card-panel" style={{ padding: '8px 6px 4px' }}>
              <ConsumptionChart govs={GOVERNORATES} />
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '8px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '1px' }} />
                  <span style={{ fontSize: '0.58rem', color: '#8899aa' }}>{t('forecast.demand')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '8px', height: '4px', background: '#00ff88', borderRadius: '1px' }} />
                  <span style={{ fontSize: '0.58rem', color: '#8899aa' }}>{t('dashboard.production')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Governorate Details — shown when a gov is selected */}
          {selectedGov && (
            <GovernorateStats
              gov={selectedGov}
              risk={effectiveRisk(selectedGov)}
              outputMw={effectiveOutput(selectedGov)}
              hydroIndicator={hydroIndicator}
            />
          )}

          {/* Blackout Prediction Peak */}
          <div>
            <div className="section-label">
              {t('dashboard.blackoutPrediction')} — {selectedGov?.name || 'Bizerte'}
            </div>
            {bLoading ? (
              <div style={{ padding: '12px', textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto' }} />
              </div>
            ) : peakWindow ? (
              <div
                className="card-panel"
                style={{
                  padding: '10px 12px',
                  borderColor: `${RISK_COLORS[peakWindow.risk_level]}33`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#e2e8f0' }}>
                    {t('forecast.peakHour')}
                  </span>
                  <RiskBadge level={peakWindow.risk_level} size="xs" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div>
                      <div style={{ fontSize: '0.58rem', color: '#8899aa' }}>{t('dashboard.time')}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>
                      {peakWindow.time_label}
                    </div>
                  </div>
                  <div>
                      <div style={{ fontSize: '0.58rem', color: '#8899aa' }}>{t('forecast.probability')}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem', fontWeight: 700, color: RISK_COLORS[peakWindow.risk_level] }}>
                      {peakWindow.blackout_probability}%
                    </div>
                  </div>
                  <div>
                      <div style={{ fontSize: '0.58rem', color: '#8899aa' }}>{t('dashboard.temperature')}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#e2e8f0' }}>
                      {peakWindow.temperature}°C
                    </div>
                  </div>
                  <div>
                      <div style={{ fontSize: '0.58rem', color: '#8899aa' }}>{t('forecast.stress')}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: RISK_COLORS[peakWindow.risk_level] }}>
                      {peakWindow.stress_ratio}×
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: '8px',
                    padding: '6px 8px',
                    background: `${RISK_COLORS[peakWindow.risk_level]}10`,
                    border: `1px solid ${RISK_COLORS[peakWindow.risk_level]}25`,
                    borderRadius: '4px',
                    fontSize: '0.6rem',
                    color: RISK_COLORS[peakWindow.risk_level],
                    fontWeight: 600,
                    lineHeight: 1.4,
                  }}
                >
                  {peakWindow.prevention_action}
                </div>
              </div>
            ) : (
              <div className="card-panel" style={{ padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#00ff88' }}>✓ {t('dashboard.noHighRiskWindow')}</div>
                <div style={{ fontSize: '0.65rem', color: '#8899aa', marginTop: '4px' }}>{t('dashboard.gridNormal')}</div>
              </div>
            )}
          </div>

          {/* Carbon Index Gauge */}
          <div>
            <div className="section-label">{t('dashboard.nationalCarbon')}</div>
            <div className="card-panel" style={{ padding: '8px' }}>
              <GaugeChart
                value={NATIONAL_CARBON_INDEX.value}
                max={NATIONAL_CARBON_INDEX.max}
                label={t('dashboard.carbonIndex')}
                unit="kg CO₂/cap/day"
                color="#06b6d4"
              />
              <div style={{ textAlign: 'center', marginTop: '4px' }}>
                <span style={{ fontSize: '0.6rem', color: '#8899aa' }}>
                  {t('dashboard.target')}: {NATIONAL_CARBON_INDEX.target} · {t('dashboard.trend')}: {NATIONAL_CARBON_INDEX.trend > 0 ? '+' : ''}{NATIONAL_CARBON_INDEX.trend}
                </span>
              </div>
            </div>
          </div>

          {/* Quick nav */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '8px', borderTop: '1px solid rgba(0,255,136,0.08)' }}>
            {[
              { label: `→ ${t('nav.analytics')}`, path: '/analytics' },
              { label: `→ ${t('nav.simulation')}`, path: '/simulation' },
            ].map(({ label, path }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                style={{
                  background: 'none',
                  border: '1px solid rgba(0,255,136,0.1)',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontSize: '0.68rem',
                  color: '#8899aa',
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.target.style.color = '#00ff88' }}
                onMouseLeave={(e) => { e.target.style.color = '#8899aa' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Floating RAG Chatbot ─────────────────────────────────────── */}
      <ChatWidget context={{ selectedGov }} />

      {/* Crisis modal */}
      {showCrisisModal && (
        <CrisisModal
          onClose={() => setShowCrisisModal(false)}
          onTrigger={async (region, risk_level, scenario_label, cascadeRegions) => {
            const alert = await triggerSimulation(region, risk_level, scenario_label, cascadeRegions)
            handleAlertTriggered(alert, cascadeRegions)
          }}
          loading={alertLoading}
          error={alertError}
        />
      )}

      {/* Alert feed — positioned absolute inside ops-room */}
      <AlertFeed
        activeAlert={activeAlert}
        cascadeAlerts={cascadeAlerts}
        historicalAlerts={activeAlert ? alerts.filter((a) => a.id !== activeAlert?.id) : []}
        reportStatus={reportStatus}
        onOpenReport={() => setOpenReport(true)}
        onRetryReport={retryReport}
        onAcknowledge={handleAcknowledge}
      />

      {openReport && (
        <DiagnosisReportModal
          report={report}
          alertId={activeAlert?.id ?? null}
          onClose={() => setOpenReport(false)}
          defaultRecipients={defaultRecipients}
        />
      )}
    </div>
  )
}
