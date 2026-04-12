import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Navbar from './components/Layout/Navbar'
import Landing    from './pages/Landing'
import Dashboard  from './pages/Dashboard'
import Analytics  from './pages/Analytics'
import Simulation from './pages/Simulation'
import About      from './pages/About'

function AppContent() {
  const { pathname } = useLocation()
  const showNav = pathname !== '/dashboard'

  return (
    <>
      {showNav && <Navbar />}
      <Routes>
        <Route path="/"           element={<Landing />}    />
        <Route path="/dashboard"  element={<Dashboard />}  />
        <Route path="/analytics"  element={<Analytics />}  />
        <Route path="/simulation" element={<Simulation />} />
        <Route path="/about"      element={<About />}      />
        {/* Fallback */}
        <Route path="*"           element={<Landing />}    />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
