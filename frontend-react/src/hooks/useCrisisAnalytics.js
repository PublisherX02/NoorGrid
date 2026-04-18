import { useState, useEffect, useCallback } from 'react'
import { getCrisisAnalytics } from '../services/api'

export function useCrisisAnalytics(days = 7) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isMock, setIsMock] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getCrisisAnalytics(days)
      setData(result.data)
      setIsMock(result.mock)
    } catch (err) {
      setError(err.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error, isMock, refetch: fetch }
}
