import { useState } from 'react'
import { STEG } from '../constants/grid'

const TEAM = [
  {
    name: 'PublisherX02',
    role: 'Fondateur & Ingénieur principal',
    desc: 'A construit NoorGrid de zéro — backend FastAPI, modèle de jumeau numérique, moteur de prédiction de pannes et infrastructure full-stack.',
    tag: 'Ingénierie',
    color: '#00ff88',
  },
]

const PROBLEM_STATS = [
  { value: '4 888 MW', label: 'Pic de demande record', date: '14 août 2024 à 15h41', color: '#ff3333' },
  { value: '4 636 MW', label: 'Capacité effective du réseau', date: '22% de pertes réseau', color: '#ff9500' },
  { value: '252 MW',   label: "Couvert par l'Algérie", date: "Via l'interconnecteur Transmed", color: '#ffd700' },
  { value: '93,7%',   label: 'Dépendance aux fossiles', date: "5-6% d'énergies renouvelables en 2024", color: '#8899aa' },
  { value: '22%',     label: 'Pertes réseau', date: 'Énergie perdue en transmission', color: '#ff9500' },
  { value: '41%',     label: 'Indépendance énergétique 2024', date: 'En baisse par rapport à 48% en 2023', color: '#ff3333' },
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
            L'infrastructure manquante d'intelligence
            <br />
            <span style={{ color: '#00ff88', textShadow: '0 0 30px rgba(0,255,136,0.3)' }}>
              énergétique de la Tunisie
            </span>
          </h1>
          <p style={{ fontSize: '1rem', color: '#8899aa', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 }}>
            NoorGrid n'est pas un tableau de bord. Ce n'est pas un outil de surveillance.
            C'est la couche d'intelligence qui n'a jamais existé.
          </p>
        </div>

        {/* ── The Problem ──────────────────────────────────────────── */}
        <section style={{ marginBottom: '4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <div style={{ width: '3px', height: '24px', background: '#ff3333', borderRadius: '2px' }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f0f4f8', letterSpacing: '-0.01em' }}>
              Le Problème
            </h2>
          </div>

          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderColor: 'rgba(255,51,51,0.15)' }}>
            <p style={{ fontSize: '0.9rem', color: '#8899aa', lineHeight: 1.75, marginBottom: '1rem' }}>
              Le <strong style={{ color: '#ff3333' }}>14 août 2024 à 15h41</strong>, le réseau national tunisien a atteint un record de{' '}
              <strong style={{ color: '#ff3333' }}>4 888 MW de demande</strong> contre une capacité effective de{' '}
              <strong style={{ color: '#ff9500' }}>4 636 MW</strong>. Le réseau était en surcapacité.
              L'Algérie a comblé l'<strong style={{ color: '#ffd700' }}>écart de 252 MW</strong> via l'interconnecteur.
              Sans elle, la Tunisie fait face à une panne en cascade.
            </p>
            <p style={{ fontSize: '0.9rem', color: '#8899aa', lineHeight: 1.75 }}>
              Ce n'est pas une hypothèse. Cela se produit chaque été.
              La Tunisie possède des parcs éoliens, des centrales solaires et des barrages hydroélectriques répartis dans 24 gouvernorats.
              Chaque installation est surveillée de manière isolée. Il n'existe aucune vue centralisée en temps réel.
              Pas de prédiction. Pas de prévention.
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
            Il n'existe aucun système numérique de suivi pour ces réseaux.
            Et il n'y a aucune culture de la prévention.
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
              Haut responsable, Division Énergies Renouvelables STEG
            </div>
            <div style={{ fontSize: '0.78rem', color: '#8899aa', marginTop: '3px' }}>Avril 2026</div>
          </div>
        </section>

        {/* ── Solution ─────────────────────────────────────────────── */}
        <section style={{ marginBottom: '4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <div style={{ width: '3px', height: '24px', background: '#00ff88', borderRadius: '2px' }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f0f4f8', letterSpacing: '-0.01em' }}>
              La Solution
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {[
              {
                num: '01',
                title: 'Jumeau numérique',
                desc: "Réplique virtuelle en temps réel du réseau tunisien. Fusion de capteurs IoT. Modèle physique sensible au temps. Déploiement automatisé de drones sur détection d'anomalie.",
                color: '#00ff88',
              },
              {
                num: '02',
                title: 'Prédiction de panne',
                desc: "Prévision 72h utilisant les données météo OpenMeteo, les courbes de demande en heure de pointe et les constantes de capacité STEG. La prévention avant la défaillance.",
                color: '#ff3333',
              },
              {
                num: '03',
                title: 'Indice carbone national',
                desc: "Premier score carbone régionalisé de Tunisie par gouvernorat. Construit à partir de données de facturation réelles et de la production renouvelable en direct. Un chiffre qui n'a jamais existé.",
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
              Équipe
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
            Dépôt GitHub →
          </a>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            Documentation API →
          </a>
        </section>

        {/* ── Contact Form ──────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <div style={{ width: '3px', height: '24px', background: '#ffd700', borderRadius: '2px' }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f0f4f8', letterSpacing: '-0.01em' }}>
              Demander une démo
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
                Message envoyé
              </div>
              <div style={{ fontSize: '0.83rem', color: '#8899aa' }}>
                Nous vous contacterons pour organiser une démonstration avec votre équipe.
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
                  { key: 'name', label: 'Nom complet', placeholder: 'Votre nom' },
                  { key: 'email', label: 'Email professionnel', placeholder: 'nom@steg.com.tn', type: 'email' },
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
                  placeholder="Décrivez votre organisation et votre cas d'usage…"
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
                Envoyer la demande
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
