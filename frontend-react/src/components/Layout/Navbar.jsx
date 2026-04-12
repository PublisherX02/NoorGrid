import { NavLink, useNavigate } from 'react-router-dom'

const NAV_LINKS = [
  { to: '/',           label: 'Home' },
  { to: '/dashboard',  label: 'Dashboard' },
  { to: '/analytics',  label: 'Analytics' },
  { to: '/simulation', label: 'Simulation' },
  { to: '/about',      label: 'About' },
]

export default function Navbar() {
  const navigate = useNavigate()

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2rem',
        background: 'rgba(10,15,26,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,255,136,0.1)',
      }}
    >
      {/* Logo */}
      <button
        onClick={() => navigate('/')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ fontSize: '1.25rem' }}>⚡</span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            fontSize: '1.05rem',
            color: '#00ff88',
            letterSpacing: '0.05em',
            textShadow: '0 0 16px rgba(0,255,136,0.4)',
          }}
        >
          NoorGrid
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            color: '#06b6d4',
            fontWeight: 500,
            letterSpacing: '0.1em',
            opacity: 0.7,
            marginTop: '2px',
          }}
        >
          v1.0
        </span>
      </button>

      {/* Links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        {NAV_LINKS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'inline-block',
              padding: '6px 14px',
              borderRadius: '5px',
              fontSize: '0.85rem',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#00ff88' : '#8899aa',
              background: isActive ? 'rgba(0,255,136,0.08)' : 'transparent',
              border: `1px solid ${isActive ? 'rgba(0,255,136,0.2)' : 'transparent'}`,
              textDecoration: 'none',
              transition: 'all 0.15s',
              letterSpacing: '0.01em',
            })}
          >
            {label}
          </NavLink>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate('/dashboard')}
        className="btn btn-primary btn-sm"
        style={{ letterSpacing: '0.02em' }}
      >
        Live Ops Room →
      </button>
    </nav>
  )
}
