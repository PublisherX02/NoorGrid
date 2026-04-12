import { useState, useCallback } from 'react'
import { predictBlackout } from '../services/api'

export function useBlackout() {
  const [predictions, setPredictions] = useState(null)
  const [region, setRegion]           = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [isMock, setIsMock]           = useState(false)

  const fetchPrediction = useCallback(async (targetRegion, hours = 24) => {
    setLoading(true)
    setError(null)
    try {
      const result = await predictBlackout(targetRegion, hours)
      setPredictions(result.data.predictions)
      setRegion(targetRegion)
      setIsMock(result.mock)
    } catch (err) {
      setError(err.message || 'Prediction failed')
    } finally {
      setLoading(false)
    }
  }, [])

  // Peak risk window: find the highest-risk consecutive block
  const peakWindow = predictions
    ? (() => {
        const critical = predictions.filter((p) => p.risk_level === 'CRITICAL' || p.risk_level === 'HIGH')
        if (!critical.length) return null
        const maxProb = Math.max(...critical.map((p) => p.blackout_probability))
        const peak = critical.find((p) => p.blackout_probability === maxProb)
        return peak
      })()
    : null

  return { predictions, region, loading, error, isMock, peakWindow, fetchPrediction }
}
