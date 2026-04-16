import { useState, useEffect, useCallback } from 'react'
import { simulateAlert, getAlertsFeed } from '../services/api'

export function useAlerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchFeed = useCallback(async () => {
    const feed = await getAlertsFeed(10)
    setAlerts(feed)
  }, [])

  useEffect(() => {
    fetchFeed()
    const interval = setInterval(fetchFeed, 15_000)
    return () => clearInterval(interval)
  }, [fetchFeed])

  const triggerSimulation = useCallback(async (region, risk_level, scenario_label) => {
    setLoading(true)
    setError(null)
    try {
      const alert = await simulateAlert(region, risk_level, scenario_label)
      setAlerts((prev) => [alert, ...prev].slice(0, 10))
      return alert
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return { alerts, loading, error, triggerSimulation }
}
