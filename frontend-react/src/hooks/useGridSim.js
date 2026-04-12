import { useState, useCallback } from 'react'
import { simulateGrid } from '../services/api'
import { AUG14_SCENARIO } from '../constants/grid'

const DEFAULT_PARAMS = {
  renewable_output_mw: 280,
  demand_delta_pct: 0,
  temperature_c: 27,
  include_peak_hour_factor: true,
  reserve_capacity_mw: 0,
}

export function useGridSim() {
  const [params, setParams]   = useState(DEFAULT_PARAMS)
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [isMock, setIsMock]   = useState(false)
  const [isReplay, setIsReplay] = useState(false)

  const simulate = useCallback(async (overrides = {}) => {
    const payload = { ...params, ...overrides }
    setLoading(true)
    setError(null)
    try {
      const res = await simulateGrid(payload)
      setResult(res.data)
      setIsMock(res.mock)
    } catch (err) {
      setError(err.message || 'Simulation failed')
    } finally {
      setLoading(false)
    }
  }, [params])

  const updateParam = useCallback((key, value) => {
    setParams((prev) => ({ ...prev, [key]: value }))
    setIsReplay(false)
  }, [])

  const replayAug14 = useCallback(async () => {
    const scenario = {
      renewable_output_mw: AUG14_SCENARIO.renewable_output_mw,
      demand_delta_pct: AUG14_SCENARIO.demand_delta_pct,
      temperature_c: AUG14_SCENARIO.temperature_c,
      include_peak_hour_factor: AUG14_SCENARIO.include_peak_hour_factor,
      reserve_capacity_mw: AUG14_SCENARIO.reserve_capacity_mw,
    }
    setParams(scenario)
    setIsReplay(true)
    setLoading(true)
    setError(null)
    try {
      const res = await simulateGrid(scenario)
      setResult(res.data)
      setIsMock(res.mock)
    } catch (err) {
      setError(err.message || 'Simulation failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setParams(DEFAULT_PARAMS)
    setResult(null)
    setIsReplay(false)
  }, [])

  return { params, result, loading, error, isMock, isReplay, simulate, updateParam, replayAug14, reset }
}
