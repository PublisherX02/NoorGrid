import { useState, useEffect, useCallback, useRef } from 'react'
import { getWeatherAll, getHealth } from '../services/api'

const POLL_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function useWeather() {
  const [weatherMap, setWeatherMap]  = useState({})
  const [loading, setLoading]        = useState(true)
  const [error, setError]            = useState(null)
  const [isMock, setIsMock]          = useState(false)
  const [backendOnline, setBackend]  = useState(null)
  const timerRef = useRef(null)

  const fetchWeather = useCallback(async () => {
    try {
      const health = await getHealth()
      setBackend(health.online)

      const result = await getWeatherAll()
      const map = {}
      for (const entry of (result.data?.data || [])) {
        map[entry.region] = entry
      }
      setWeatherMap(map)
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

  return { weatherMap, loading, error, isMock, backendOnline, refetch: fetchWeather }
}
