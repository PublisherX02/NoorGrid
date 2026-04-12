import { useState } from 'react'
import { STEG } from '../constants/grid'

const TEAM = [
  {
    name: 'PublisherX02',
    role: 'Founder & Lead Engineer',
    desc: 'Built NoorGrid from the ground up — FastAPI backend, digital twin model, blackout prediction engine, and full-stack infrastructure.',
    tag: 'Engineering',
    color: '#00ff88',
  },
]

const PROBLEM_STATS = [
  { value: '4,888 MW', label: 'Record demand peak', date: 'Aug 14, 2024 at 15:41', color: '#ff3333' },
  { value: '4,636 MW', label: 'Effective grid capacity', date: '22% grid losses', color: '#ff9500' },
  { value: '252 MW',   label: 'Covered by Algeria', date: 'Via Transmed interconnector', color: '#ffd700' },
  { value: '93.7%',   label: 'Fossil fuel dependency', date: '5-6% renewable share in 2024', color: '#8899aa' },
  { value: '22%',     label: 'Grid losses', date: 'Energy wasted in transmission', color: '#ff9500' },
  { value: '41%',     label: 'Energy independence 2024', date: 'Down from 48% in 2023', color: '#ff3333' },
]

export default function About() {
  const [formState, setFormState]   = useState({ name: '', email: '', message: '' })
  const [submitted, setSubmitted]   = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="page-in" style={{ background: '#0a0f1a', minHeight: '100vh', paddingTop: '56px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '3rem 2rem' }}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(0,255,136,0.06)',
              border: '1px solid rgba(0,255,136,0.2)',
              borderRadius: '20px',
              padding: '5px 14px',
              marginBottom: '1.5rem',
              fontSize: '0.72rem',
              fontWeight: 600,
              color: '#00ff88',
              letterSpacing: '0.08em',
            }}
          >
            B2G · SaaS · Tunisia
          </div>
          <h1
            style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              fontWeight: 900,
              color: '#f0f4f8',
              letterSpacing: '-0.03em',
              marginBottom: '1rem',
            }}
          >
            Tunisia's Missing Energy
            <br />
            <span style={{ color: '#00ff88', textShadow: '0 0 30px rgba(0,255,136,0.3)' }}>
              Intelligence Infrastructure
            </span>
          </h1>
          <p style={{ fontSize: '1rem', color: '#8899aa', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 }}>
            NoorGrid is not a dashboard. It is not a monitoring tool.
            It is the intelligence layer that has never existed.
          </p>
        </div>

        {/* ── The Problem ──────────────────────────────────────────── */}
        <section style={{ marginBottom: '4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <div style={{ width: '3px', height: '24px', background: '#ff3333', borderRadius: '2px' }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f0f4f8', letterSpacing: '-0.01em' }}>
              The Problem
            </h2>
          </div>

          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderColor: 'rgba(255,51,51,0.15)' }}>
            <p style={{ fontSize: '0.9rem', color: '#8899aa', lineHeight: 1.75, marginBottom: '1rem' }}>
              On <strong style={{ color: '#ff3333' }}>August 14, 2024 at 15:41</strong>, Tunisia's national grid hit a record{' '}
              <strong style={{ color: '#ff3333' }}>4,888 MW of demand</strong> against an effective capacity of{' '}
              <strong style={{ color: '#ff9500' }}>4,636 MW</strong>. The grid was over capacity.
              Algeria covered the <strong style={{ color: '#ffd700' }}>252 MW gap</strong> through the interconnector.
              Without them, Tunisia faces a cascading blackout.
            </p>
            <p style={{ fontSize: '0.9rem', color: '#8899aa', lineHeight: 1.75 }}>
              This is not a hypothetical. This happens every summer.
              Tunisia has wind farms, solar plants, and hydroelectric dams scattered across 24 governorates.
              Each installation is monitored in isolation. There is no centralized real-time view.
              There is no prediction. There is no prevention.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            {PROBLEM_STATS.map((s, i) => (
              <div
                key={i}
                className="card"
                style={{ padding: '1rem 1.25rem', borderColor: `${s.color}22` }}
              >
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '1.4rem',
                    fontWeight: 700,
                    color: s.color,
                    marginBottom: '4px',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '2px' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#8899aa' }}>{s.date}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── STEG Quote (prominent) ──────────────────────────────── */}
        <section
          style={{
            marginBottom: '4rem',
            padding: '2.5rem',
            background: 'rgba(13,21,38,0.8)',
            border: '1px solid rgba(0,255,136,0.15)',
            borderRadius: '12px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(90deg, transparent, #00ff88, transparent)',
            }}
          />
          <div
            style={{
              fontSize: '3.5rem',
              color: '#00ff88',
              opacity: 0.2,
              lineHeight: 1,
              marginBottom: '1rem',
              fontFamily: 'Georgia, serif',
              position: 'absolute',
              top: '20px',
              left: '24px',
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
              fontStyle: 'italic',
              margin: '0 0 1.5rem',
              paddingLeft: '1rem',
              letterSpacing: '-0.01em',
            }}
          >
            There is no digital follow-up system for these grids.
            And there is no prevention mindset.
          </blockquote>
          <div style={{ paddingLeft: '1rem' }}>
            <div
              style={{
                width: '30px',
                height: '2px',
                background: '#00ff88',
                opacity: 0.5,
                marginBottom: '8px',
              }}
            />
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0' }}>
              Senior Official, STEG Renewable Energy Division
            </div>
            <div style={{ fontSize: '0.78rem', color: '#8899aa', marginTop: '3px' }}>April 2026</div>
          </div>
        </section>

        {/* ── Solution ─────────────────────────────────────────────── */}
        <section style={{ marginBottom: '4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <div style={{ width: '3px', height: '24px', background: '#00ff88', borderRadius: '2px' }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f0f4f8', letterSpacing: '-0.01em' }}>
              The Solution
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {[
              {
                num: '01',
                title: 'Digital Twin',
                desc: "Real-time virtual replica of Tunisia's grid. IoT sensor fusion. Time-aware physics model. Automated drone dispatch on anomaly detection.",
                color: '#00ff88',
              },
              {
                num: '02',
                title: 'Blackout Prediction',
                desc: '72-hour forecast using OpenMeteo weather data, peak-hour demand curves, and STEG capacity constants. Prevention before failure.',
                color: '#ff3333',
              },
              {
                num: '03',
                title: 'National Carbon Index',
                desc: "Tunisia's first regionalized carbon score per governorate. Built from real billing data and live renewable production. A number that has never existed.",
                color: '#06b6d4',
              },
            ].map((s) => (
              <div key={s.num} className="card" style={{ padding: '1.5rem', borderColor: `${s.color}20` }}>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    color: s.color,
                    opacity: 0.6,
                    marginBottom: '8px',
                    letterSpacing: '0.1em',
                  }}
                >
                  {s.num}
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f0f4f8', marginBottom: '8px' }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: '0.83rem', color: '#8899aa', lineHeight: 1.65 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Team ─────────────────────────────────────────────────── */}
        <section style={{ marginBottom: '4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <div style={{ width: '3px', height: '24px', background: '#06b6d4', borderRadius: '2px' }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f0f4f8', letterSpacing: '-0.01em' }}>
              Team
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {TEAM.map((m) => (
              <div key={m.name} className="card" style={{ padding: '1.5rem', borderColor: `${m.color}20` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      background: `${m.color}12`,
                      border: `1px solid ${m.color}30`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.2rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 700,
                      color: m.color,
                    }}
                  >
                    {m.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.9rem' }}>{m.name}</div>
                    <div
                      style={{
                        fontSize: '0.65rem',
                        color: m.color,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {m.tag}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#8899aa', fontWeight: 500, marginBottom: '8px' }}>
                  {m.role}
                </div>
                <p style={{ fontSize: '0.78rem', color: '#8899aa', lineHeight: 1.6 }}>{m.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Links ────────────────────────────────────────────────── */}
        <section style={{ marginBottom: '4rem', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a
            href="https://github.com/PublisherX02/NoorGrid"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
          >
            GitHub Repository →
          </a>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            API Documentation →
          </a>
        </section>

        {/* ── Contact Form ──────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <div style={{ width: '3px', height: '24px', background: '#ffd700', borderRadius: '2px' }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f0f4f8', letterSpacing: '-0.01em' }}>
              Request Demo
            </h2>
          </div>

          {submitted ? (
            <div
              className="card"
              style={{
                padding: '2rem',
                textAlign: 'center',
                borderColor: 'rgba(0,255,136,0.3)',
                background: 'rgba(0,255,136,0.05)',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>✓</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#00ff88', marginBottom: '6px' }}>
                Message sent
              </div>
              <div style={{ fontSize: '0.83rem', color: '#8899aa' }}>
                We'll be in touch to arrange a demo with your team.
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="card"
              style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                  { key: 'name', label: 'Full Name', placeholder: 'Your name' },
                  { key: 'email', label: 'Work Email', placeholder: 'name@steg.com.tn', type: 'email' },
                ].map(({ key, label, placeholder, type }) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {label}
                    </label>
                    <input
                      type={type || 'text'}
                      required
                      placeholder={placeholder}
                      value={formState[key]}
                      onChange={(e) => setFormState((p) => ({ ...p, [key]: e.target.value }))}
                      style={{
                        background: '#0d1526',
                        border: '1px solid rgba(0,255,136,0.15)',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        fontSize: '0.85rem',
                        color: '#e2e8f0',
                        outline: 'none',
                        fontFamily: "'Inter', sans-serif",
                        transition: 'border-color 0.15s',
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'rgba(0,255,136,0.4)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(0,255,136,0.15)'}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Message
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Tell us about your organization and use case…"
                  value={formState.message}
                  onChange={(e) => setFormState((p) => ({ ...p, message: e.target.value }))}
                  style={{
                    background: '#0d1526',
                    border: '1px solid rgba(0,255,136,0.15)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    fontSize: '0.85rem',
                    color: '#e2e8f0',
                    outline: 'none',
                    fontFamily: "'Inter', sans-serif",
                    resize: 'vertical',
                    minHeight: '100px',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'rgba(0,255,136,0.4)'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(0,255,136,0.15)'}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                Send Request
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
