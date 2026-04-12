import { useState, useEffect, useCallback, useRef } from 'react'
import { getWeather, getHealth } from '../services/api'

const POLL_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function useWeather() {
  const [weather, setWeather]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [isMock, setIsMock]         = useState(false)
  const [backendOnline, setBackend] = useState(null)
  const timerRef = useRef(null)

  const fetchWeather = useCallback(async () => {
    try {
      const health = await getHealth()
      setBackend(health.online)

      const result = await getWeather()
      setWeather(result.data)
      setIsMock(result.mock)
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to fetch weather')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWeather()
    timerRef.current = setInterval(fetchWeather, POLL_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [fetchWeather])

  return { weather, loading, error, isMock, backendOnline, refetch: fetchWeather }
}
