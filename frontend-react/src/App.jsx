import { Component } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Navbar from './components/Layout/Navbar'
import Landing    from './pages/Landing'
import Dashboard  from './pages/Dashboard'
import Analytics  from './pages/Analytics'
import Simulation from './pages/Simulation'
import About      from './pages/About'
import CrisisIntelligence from './pages/CrisisIntelligence'

class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { crashed: true, error }
  }

  render() {
    if (this.state.crashed) {
      return (
        <div style={{ minHeight: '100vh', background: '#060c18', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: '#ff3333' }}>PAGE ERROR</div>
          <div style={{ fontSize: 12, color: '#64748b', maxWidth: 400, textAlign: 'center' }}>{String(this.state.error)}</div>
          <button
            onClick={() => { this.setState({ crashed: false, error: null }); window.history.back() }}
            style={{ border: '1px solid rgba(0,255,136,0.3)', background: 'none', color: '#00ff88', borderRadius: 4, padding: '6px 16px', fontSize: 12, cursor: 'pointer' }}
          >
            Go Back
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function AppContent() {
  const { i18n } = useTranslation()
  const { pathname } = useLocation()
  const showNav = pathname !== '/dashboard' && pathname !== '/crisis-intelligence'
  const languageKey = i18n.resolvedLanguage || i18n.language || 'fr'

  return (
    <div key={languageKey}>
      {showNav && <Navbar />}
      <Routes>
        <Route path="/"           element={<Landing />}    />
        <Route path="/dashboard"  element={<Dashboard />}  />
        <Route path="/analytics"  element={<Analytics />}  />
        <Route path="/simulation" element={<Simulation />} />
        <Route path="/crisis-intelligence" element={<PageErrorBoundary><CrisisIntelligence /></PageErrorBoundary>} />
        <Route path="/about"      element={<About />}      />
        {/* Fallback */}
        <Route path="*"           element={<Landing />}    />
      </Routes>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
