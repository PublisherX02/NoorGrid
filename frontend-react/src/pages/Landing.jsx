import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ParticleBackground from '../components/Landing/ParticleBackground'
import { useWeather } from '../hooks/useWeather'

// ─── Feature Cards ─────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
      </svg>
    ),
    color: '#00ff88',
    title: 'landing.feature1Title',
    desc: 'landing.feature1Desc',
    tag: 'landing.feature1Tag',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    color: '#ff3333',
    title: 'landing.feature2Title',
    desc: 'landing.feature2Desc',
    tag: 'landing.feature2Tag',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <polyline points="7.5 4.21 12 6.81 16.5 4.21" /><line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    color: '#06b6d4',
    title: 'landing.feature3Title',
    desc: 'landing.feature3Desc',
    tag: 'landing.feature3Tag',
  },
]

// ─── Stats ────────────────────────────────────────────────────────────────
const STATS = [
  { value: '5 944', unit: 'MW', label: 'landing.stat1' },
  { value: '4 888', unit: 'MW', label: 'landing.stat2' },
  { value: '22%',   unit: '',   label: 'landing.stat3' },
  { value: '14%',   unit: '',   label: 'landing.stat4' },
  { value: '93,7%', unit: '',   label: 'landing.stat5' },
]

// ─── Tech Stack ───────────────────────────────────────────────────────────
const TECH = [
  { name: 'OpenMeteo',  color: '#00ff88' },
  { name: 'TomTom',     color: '#ff3333' },
  { name: 'NVIDIA NIM', color: '#76b900' },
  { name: 'FastAPI',    color: '#06b6d4' },
  { name: 'STEG',       color: '#ffd700' },
]

export default function Landing() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { weatherMap, loading } = useWeather()
  const liveEntries = Object.values(weatherMap || {})
  const hasLiveData = liveEntries.length > 0
  const critical = hasLiveData ? liveEntries.filter((entry) => entry?.risk_level === 'CRITICAL').length : 0
  const high = hasLiveData ? liveEntries.filter((entry) => entry?.risk_level === 'HIGH').length : 0
  const hasRiskAlert = critical > 0 || high > 0
  const statusTone = loading
    ? {
        bg: 'rgba(6,182,212,0.08)',
        border: '1px solid rgba(6,182,212,0.3)',
        color: '#06b6d4',
      }
    : hasRiskAlert
      ? {
          bg: 'rgba(255,51,51,0.08)',
          border: '1px solid rgba(255,51,51,0.25)',
          color: '#ff3333',
        }
      : {
          bg: 'rgba(0,255,136,0.08)',
          border: '1px solid rgba(0,255,136,0.25)',
          color: '#00ff88',
        }
  const statusLabel = loading
    ? t('landing.liveSync')
    : hasRiskAlert
      ? t('landing.liveStatus', { critical, high })
      : t('landing.liveStable')

  return (
    <div className="page-in" style={{ background: '#0a0f1a', minHeight: '100vh', paddingTop: '56px' }}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          minHeight: 'calc(100vh - 56px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: '4rem 2rem',
        }}
      >
        <ParticleBackground />

        {/* Radial gradient overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(0,255,136,0.05) 0%, transparent 70%)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />

        {/* Hero content */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            textAlign: 'center',
            maxWidth: '780px',
          }}
        >
          {/* Status badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: statusTone.bg,
              border: statusTone.border,
              borderRadius: '20px',
              padding: '5px 14px',
              marginBottom: '2rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: statusTone.color,
              letterSpacing: '0.06em',
            }}
          >
            <span
              className="live-dot"
              style={{ background: statusTone.color, boxShadow: `0 0 6px ${statusTone.color}` }}
            />
            {statusLabel}
          </div>

          {/* Main headline */}
          <h1
            style={{
              fontSize: 'clamp(2.2rem, 5.5vw, 4rem)',
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
              marginBottom: '1.5rem',
              color: '#f0f4f8',
            }}
          >
            {t('landing.heroLine1')}{' '}
            <span
              style={{
                color: '#00ff88',
                textShadow: '0 0 40px rgba(0,255,136,0.4)',
              }}
            >
              {t('landing.heroLine2')}
            </span>
            <br />
            {t('landing.heroLine3')}
          </h1>

          {/* Sub-headline */}
          <p
            style={{
              fontSize: 'clamp(0.9rem, 2vw, 1.1rem)',
              color: '#8899aa',
              lineHeight: 1.7,
              maxWidth: '560px',
              margin: '0 auto 2.5rem',
            }}
          >
            {t('landing.heroSub')}
          </p>

          {/* CTA Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/about')}
              className="btn btn-primary btn-lg"
            >
              {t('landing.requestDemo')}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn btn-outline btn-lg"
            >
              {t('landing.viewDashboard')}
            </button>
          </div>

          {/* Scroll hint */}
          <div
            style={{
              marginTop: '3rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              opacity: 0.4,
            }}
          >
            <span style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: '#8899aa' }}>{t('landing.scroll')}</span>
            <div
              style={{
                width: '1px',
                height: '32px',
                background: 'linear-gradient(to bottom, #00ff88, transparent)',
              }}
            />
          </div>
        </div>
      </section>

      {/* ── Stats Bar ──────────────────────────────────────────────────── */}
      <section
        style={{
          background: 'rgba(13,21,38,0.8)',
          borderTop: '1px solid rgba(0,255,136,0.1)',
          borderBottom: '1px solid rgba(0,255,136,0.1)',
          backdropFilter: 'blur(8px)',
          padding: '1.25rem 2rem',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          {STATS.map((s, i) => (
            <div key={i} style={{ textAlign: 'center', flex: '1 1 140px' }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)',
                  fontWeight: 700,
                  color: '#00ff88',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                {s.value}
                <span style={{ fontSize: '0.7em', opacity: 0.7 }}>{s.unit}</span>
              </div>
              <div
                style={{
                  fontSize: '0.68rem',
                  color: '#8899aa',
                  marginTop: '4px',
                  letterSpacing: '0.04em',
                  fontWeight: 500,
                }}
              >
                 {t(s.label)}
               </div>
             </div>
           ))}
        </div>
      </section>

      {/* ── Feature Cards ──────────────────────────────────────────────── */}
      <section style={{ padding: '5rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <p
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#00ff88',
              marginBottom: '0.75rem',
            }}
          >
            {t('landing.threePillars')}
          </p>
          <h2
            style={{
              fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#f0f4f8',
            }}
          >
            {t('landing.pillarsTitle')}
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="card"
              style={{
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                borderColor: `${f.color}22`,
                transition: 'border-color 0.2s, box-shadow 0.2s',
                cursor: 'default',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${f.color}55`
                e.currentTarget.style.boxShadow   = `0 0 30px ${f.color}15`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = `${f.color}22`
                e.currentTarget.style.boxShadow   = 'none'
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '10px',
                  background: `${f.color}12`,
                  border: `1px solid ${f.color}30`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: f.color,
                }}
              >
                {f.icon}
              </div>

              {/* Tag */}
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: `${f.color}10`,
                  border: `1px solid ${f.color}30`,
                  color: f.color,
                  alignSelf: 'flex-start',
                }}
                 >
                 {t(f.tag)}
               </span>

              <h3
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: '#f0f4f8',
                  letterSpacing: '-0.01em',
                }}
              >
                  {t(f.title)}
                </h3>
                <p style={{ fontSize: '0.88rem', color: '#8899aa', lineHeight: 1.65 }}>{t(f.desc)}</p>
              </div>
            ))}
        </div>
      </section>

      {/* ── Testimonial ────────────────────────────────────────────────── */}
      <section
        style={{
          padding: '5rem 2rem',
          background: 'rgba(13,21,38,0.6)',
          borderTop: '1px solid rgba(0,255,136,0.08)',
          borderBottom: '1px solid rgba(0,255,136,0.08)',
        }}
      >
        <div style={{ maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
          <div
            style={{
              fontSize: '3rem',
              color: '#00ff88',
              opacity: 0.3,
              lineHeight: 1,
              marginBottom: '1.5rem',
              fontFamily: 'Georgia, serif',
            }}
          >
            "
          </div>
          <blockquote
            style={{
              fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)',
              fontWeight: 500,
              color: '#d0dae8',
              lineHeight: 1.55,
              letterSpacing: '-0.01em',
              marginBottom: '2rem',
              fontStyle: 'italic',
            }}
          >
            {t('landing.quote')}
          </blockquote>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '2px',
                background: '#00ff88',
                opacity: 0.5,
                marginBottom: '6px',
              }}
            />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
              {t('landing.quoteAuthor')}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#8899aa' }}>{t('landing.quoteDate')}</span>
          </div>
        </div>
      </section>

      {/* ── Tech Stack ─────────────────────────────────────────────────── */}
      <section style={{ padding: '4rem 2rem' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <p
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#4a5568',
              marginBottom: '1.5rem',
            }}
          >
            {t('landing.poweredBy')}
          </p>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {TECH.map((t, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 20px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#8899aa',
                  letterSpacing: '0.04em',
                  transition: 'all 0.2s',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color        = t.color
                  e.currentTarget.style.borderColor  = `${t.color}40`
                  e.currentTarget.style.background   = `${t.color}08`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color        = '#8899aa'
                  e.currentTarget.style.borderColor  = 'rgba(255,255,255,0.07)'
                  e.currentTarget.style.background   = 'rgba(255,255,255,0.03)'
                }}
              >
                {t.name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer CTA ─────────────────────────────────────────────────── */}
      <section
        style={{
          padding: '5rem 2rem',
          textAlign: 'center',
          borderTop: '1px solid rgba(0,255,136,0.08)',
        }}
      >
        <h2
          style={{
            fontSize: 'clamp(1.4rem, 3vw, 2rem)',
            fontWeight: 800,
            color: '#f0f4f8',
            marginBottom: '1rem',
            letterSpacing: '-0.02em',
          }}
        >
          {t('landing.footerTitle')}
        </h2>
        <p style={{ color: '#8899aa', marginBottom: '2rem', fontSize: '0.95rem' }}>
          {t('landing.footerSub')}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/dashboard')} className="btn btn-primary btn-lg">
            {t('landing.enterOpsRoom')}
          </button>
          <button onClick={() => navigate('/about')} className="btn btn-outline btn-lg">
            {t('landing.learnMore')}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          padding: '1.5rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img
            src="/channels4_profile.jpg"
            alt="STEG"
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '4px',
              objectFit: 'cover',
              border: '1px solid rgba(0,255,136,0.25)',
            }}
          />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#00ff88',
            }}
          >
            NoorGrid
          </span>
        </span>
        <span style={{ fontSize: '0.75rem', color: '#4a5568' }}>
          {t('landing.footerPlatform', { year: new Date().getFullYear() })}
        </span>
        <a
          href="https://github.com/PublisherX02/NoorGrid"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '0.75rem', color: '#8899aa', textDecoration: 'none' }}
        >
          {t('landing.github')}
        </a>
      </footer>
    </div>
  )
}
