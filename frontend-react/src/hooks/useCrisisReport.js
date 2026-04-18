import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generateReport } from '../services/api'
import { SCENARIOS } from '../components/Crisis/CrisisModal'

const scenarioMap = Object.fromEntries(SCENARIOS.map((s) => [s.label, s]))

function fallbackReport(activeAlert, cascadeAlerts = []) {
  return {
    scenario_label: activeAlert?.scenario_label || 'Crisis Scenario',
    region: activeAlert?.region || 'Unknown',
    risk_level: activeAlert?.risk_level || 'HIGH',
    source: 'Mixed',
    magnitude_mw: 0,
    cascade_regions: cascadeAlerts.map((c) => ({ name: c.name, risk_level: c.risk_level })),
    prevention_actions: activeAlert?.prevention_actions || [],
    root_cause:
      'A rapid generation drop created an imbalance between available capacity and demand in the affected zone.',
    technical_fix:
      'Activate reserve generation, rebalance inter-region dispatch, and stabilize load at critical substations.',
    impact_summary:
      'Without immediate balancing, downstream regions may experience constrained service continuity.',
    recommended_actions: [
      'Activate emergency reserve protocol',
      'Reduce non-critical industrial load',
      'Increase interconnect import capacity',
      'Dispatch field engineers for stabilization checks',
    ],
    generated_at: new Date().toISOString(),
  }
}

export function useCrisisReport({ activeAlert, cascadeAlerts = [] }) {
  const [reportStatus, setReportStatus] = useState('idle')
  const [report, setReport] = useState(null)
  const [openReport, setOpenReport] = useState(false)

  // Ref so onDronesReturned can read the current status without being recreated on every change.
  // Without this, changing reportStatus ('idle'→'generating'→'ready') would produce a new callback
  // reference each time, re-trigger DroneLayer's useEffect, and restart all drones from scratch.
  const reportStatusRef = useRef(reportStatus)
  useEffect(() => { reportStatusRef.current = reportStatus }, [reportStatus])

  const defaultRecipients = useMemo(() => {
    const raw = import.meta.env.VITE_REPORT_RECIPIENTS || ''
    return raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  }, [])

  const _fetchReport = useCallback(async () => {
    const scenario = scenarioMap[activeAlert.scenario_label]
    const payload = {
      region: activeAlert.region,
      risk_level: activeAlert.risk_level,
      scenario_label: activeAlert.scenario_label,
      source: scenario?.source || 'Mixed',
      magnitude_mw: scenario?.magnitude_mw || 0,
      cascade_regions: (cascadeAlerts || []).map((c) => ({ name: c.name, risk_level: c.risk_level })),
      prevention_actions: activeAlert.prevention_actions || [],
    }
    try {
      const generated = await generateReport(payload)
      setReport(generated)
      setReportStatus('ready')
    } catch {
      setReport(fallbackReport(activeAlert, cascadeAlerts))
      setReportStatus('error')
    }
  }, [activeAlert, cascadeAlerts])

  const onDronesReturned = useCallback(async () => {
    if (!activeAlert || reportStatusRef.current !== 'idle') return
    setReportStatus('generating')
    await _fetchReport()
  }, [activeAlert, _fetchReport])

  const retryReport = useCallback(async () => {
    if (!activeAlert) return
    setReportStatus('generating')
    await _fetchReport()
  }, [activeAlert, _fetchReport])

  useEffect(() => {
    if (!activeAlert) {
      setReportStatus('idle')
      setReport(null)
      setOpenReport(false)
    }
  }, [activeAlert])

  return {
    reportStatus,
    report,
    openReport,
    setOpenReport,
    onDronesReturned,
    retryReport,
    defaultRecipients,
  }
}

