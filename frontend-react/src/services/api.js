import axios from 'axios'
import { GOVERNORATES } from '../constants/grid'

// Empty default → relative URLs → Vite dev proxy forwards to localhost:8000.
// Set VITE_API_URL in .env.local only for production builds served outside Vite.
const BASE_URL = import.meta.env.VITE_API_URL || ''

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
})

// ─── Mock Data Generators ─────────────────────────────────────────────────────

const MOCK_WEATHER = {
  data: [
    { region: 'Bizerte', latitude: 37.2744, longitude: 9.8739, wind_speed_ms: 8.2, solar_irradiance_wm2: 420 },
    { region: 'Nabeul', latitude: 36.4561, longitude: 10.7376, wind_speed_ms: 6.5, solar_irradiance_wm2: 580 },
    { region: 'Tozeur', latitude: 33.9197, longitude: 8.1335, wind_speed_ms: 3.1, solar_irradiance_wm2: 820 },
    { region: 'Béja', latitude: 36.7256, longitude: 9.1817, wind_speed_ms: 5.8, solar_irradiance_wm2: 390 },
    { region: 'Sidi Bouzid', latitude: 35.0382, longitude: 9.4858, wind_speed_ms: 4.2, solar_irradiance_wm2: 750 },
  ],
}

const _mockHistory = (region, days = 7) => {
  const records = []
  const now = new Date()
  for (let d = days; d >= 0; d--) {
    for (let h = 0; h < 24; h += 3) {
      const ts = new Date(now)
      ts.setDate(ts.getDate() - d)
      ts.setHours(h, 0, 0, 0)
      const daylight = h >= 6 && h <= 19
      records.push({
        region,
        latitude: 35.0,
        longitude: 9.5,
        wind_speed_ms: +(3 + Math.random() * 9).toFixed(2),
        solar_irradiance_wm2: daylight ? +(150 + Math.random() * 650).toFixed(1) : 0,
        recorded_at: ts.toISOString(),
      })
    }
  }
  return { region, days, records }
}

const _mockBlackout = (region, forecast_hours = 24) => {
  const predictions = []
  for (let i = 0; i < forecast_hours; i++) {
    const hour = i % 24
    const temp = +(20 + 14 * Math.sin((hour - 6) * Math.PI / 12) + (Math.random() - 0.5) * 4).toFixed(1)
    const demandBase = 70 + 35 * Math.sin((hour - 8) * Math.PI / 12)
    const coolingBoost = temp > 28 ? (temp - 28) * 4 : 0
    const demand = +(demandBase + coolingBoost + (Math.random() - 0.5) * 8).toFixed(2)
    const available = +(85 + Math.random() * 25).toFixed(2)
    const stress = +(demand / available).toFixed(3)
    const prob = +Math.min(100, Math.max(0, (stress - 1) * 25)).toFixed(1)
    const risk =
      stress > 1.4 ? 'CRITICAL' :
        stress > 1.2 ? 'HIGH' :
          stress > 1.0 ? 'ELEVATED' : 'NOMINAL'
    const label = `${String(hour).padStart(2, '0')}:00`
    predictions.push({
      hour: i,
      time_label: label,
      temperature: temp,
      estimated_demand_mw: demand,
      available_mw: available,
      stress_ratio: stress,
      risk_level: risk,
      blackout_probability: prob,
      prevention_action:
        risk === 'CRITICAL' ? 'EMERGENCY LOAD SHEDDING — Import from Algeria' :
          risk === 'HIGH' ? 'ACTIVATE RESERVE CAPACITY — Reduce industrial load' :
            risk === 'ELEVATED' ? 'MONITOR CLOSELY — Prepare demand response' :
              'NO ACTION REQUIRED',
    })
  }
  return { region, predictions }
}

const MOCK_GRID_SIM = {
  total_demand_mw: 3980.5,
  renewable_output_mw: 280,
  effective_capacity_mw: 4636,
  deficit_mw: 0,
  import_required_mw: 0,
  import_reliance_pct: 0,
  renewable_share_pct: 7.03,
  headroom_pct: 14.11,
  risk_level: 'ELEVATED',
  risk_score: 57.7,
  recommended_action: 'PREPARE DEMAND RESPONSE + MONITOR GRID FREQUENCY',
  drivers: {
    baseline_demand_mw: 2800,
    seasonal_base_demand_mw: 3800,
    cooling_surge_factor: 0.08,
    peak_hour_factor: 1.05,
    demand_delta_pct: 0,
    temperature_c: 27,
    reserve_capacity_mw: 0,
  },
}

// ─── API Calls with Mock Fallback ─────────────────────────────────────────────

export const getHealth = async () => {
  try {
    const res = await client.get('/health')
    return { online: true, data: res.data }
  } catch {
    return { online: false, data: null }
  }
}

export const getWeather = async () => {
  try {
    const res = await client.get('/weather')
    return { data: res.data, mock: false }
  } catch {
    return { data: MOCK_WEATHER, mock: true }
  }
}

const _mockWeatherAll = () => ({
  data: GOVERNORATES.map((g) => {
    const wind = g.mock_wind || 5.0
    const irr  = g.mock_irradiance || 500

    let output_mw
    if (g.source === 'Wind') {
      output_mw = +(0.5 * 1.225 * (g.rotor_area || 5000) * Math.pow(wind, 3) * (g.efficiency || 0.4) / 1e6).toFixed(2)
    } else if (g.source === 'Solar') {
      output_mw = +(irr * (g.panel_area || 100000) * (g.efficiency || 0.18) / 1e6).toFixed(2)
    } else if (g.source === 'Hydro') {
      output_mw = g.baseline_mw
    } else {
      // Mixed: 60% fossil baseline + 40% wind offset
      const wind_offset = 0.5 * 1.225 * (g.rotor_area || 5000) * Math.pow(wind, 3) * (g.efficiency || 0.35) / 1e6
      output_mw = +(0.60 * g.baseline_mw + 0.40 * wind_offset).toFixed(2)
    }
    output_mw = Math.max(0, output_mw)

    const ratio = output_mw / Math.max(g.avg_demand_mw || 1, 1)
    const risk_level =
      ratio < 0.30 ? 'CRITICAL' :
      ratio < 0.50 ? 'HIGH' :
      ratio < 0.70 ? 'ELEVATED' : 'NOMINAL'

    return { region: g.name, wind_ms: wind, irradiance: irr, output_mw, risk_level, source: g.source }
  }),
})

export const getWeatherAll = async () => {
  try {
    const res = await client.get('/weather/all')
    return { data: res.data, mock: false }
  } catch {
    return { data: _mockWeatherAll(), mock: true }
  }
}

export const getHistory = async (region, days = 7) => {
  try {
    const res = await client.get(`/history/${encodeURIComponent(region)}`, { params: { days } })
    return { data: res.data, mock: false }
  } catch {
    return { data: _mockHistory(region, days), mock: true }
  }
}

export const predictBlackout = async (region, forecast_hours = 24) => {
  try {
    const res = await client.post('/predict/blackout', { region, forecast_hours })
    return { data: res.data, mock: false }
  } catch {
    return { data: _mockBlackout(region, forecast_hours), mock: true }
  }
}

export const getHydroForecast = async (months = 12) => {
  try {
    const res = await client.get('/hydro/forecast', { params: { months } })
    return { data: res.data, mock: false, error: false }
  } catch {
    return { data: null, mock: true, error: true }
  }
}

export const simulateGrid = async (params) => {
  try {
    const res = await client.post('/grid/simulate', params)
    return { data: res.data, mock: false }
  } catch {
    // Scale mock based on params
    const base = { ...MOCK_GRID_SIM }
    base.drivers = { ...base.drivers, ...params }
    return { data: base, mock: true }
  }
}

export const calcWindPower = async (wind_speed, rotor_area, efficiency) => {
  try {
    const res = await client.post('/energy/wind', { wind_speed, rotor_area, efficiency })
    return res.data.power_mw
  } catch {
    return +(0.5 * 1.225 * rotor_area * Math.pow(wind_speed, 3) * efficiency / 1_000_000).toFixed(2)
  }
}

export const calcSolarPower = async (irradiance, panel_area, efficiency) => {
  try {
    const res = await client.post('/energy/solar', { irradiance, panel_area, efficiency })
    return res.data.power_mw
  } catch {
    return +(irradiance * panel_area * efficiency / 1_000_000).toFixed(2)
  }
}

export const calcCarbon = async (region, consumption_kwh, renewable_kwh) => {
  try {
    const res = await client.post('/energy/carbon', { region, consumption_kwh, renewable_kwh })
    return res.data
  } catch {
    const score = Math.max(0, (consumption_kwh - renewable_kwh) * 0.423)
    return { region, carbon_score_kg: +score.toFixed(2) }
  }
}

// ─── RAG Chatbot ──────────────────────────────────────────────────────────────
// Calls POST /rag/query on the FastAPI backend, which proxies to NVIDIA NIM.
// No client-side mock fallback — if the backend is unreachable the user sees
// a clear connection error instead of a fake "AI" response.

export const sendMessageToRAG = async (message, context = {}) => {
  try {
    const res = await client.post('/rag/query', { message, context }, { timeout: 32000 })
    return {
      content:  res.data.response || '',
      mock:     false,
      rejected: res.data.rejected || false,
      error:    false,
    }
  } catch (err) {
    const status = err?.response?.status
    const detail = err?.response?.data?.detail || ''

    let errorMsg
    if (!err?.response) {
      errorMsg = 'Cannot reach the NoorGrid backend. Make sure the FastAPI server is running on port 8000.'
    } else if (status === 503) {
      errorMsg = 'NVIDIA NIM API key is not configured on the server. Add NVIDIA_NIM_API_KEY to the backend .env file.'
    } else if (status === 502) {
      errorMsg = `NIM API error: ${detail || 'The language model service is temporarily unavailable.'}`
    } else {
      errorMsg = `Backend error (${status || 'unknown'}): ${detail || err.message}`
    }

    return { content: errorMsg, mock: false, rejected: false, error: true }
  }
}

export const simulateAlert = async (region, risk_level, scenario_label, cascade_regions = []) => {
  try {
    // Backend expects list[str]; normalize objects like {name, risk_level} to plain names
    const names = cascade_regions.map((c) => (typeof c === 'string' ? c : c.name))
    const resp = await client.post('/alerts/simulate', { region, risk_level, scenario_label, cascade_regions: names })
    return resp.data
  } catch (err) {
    throw new Error(err.response?.data?.detail || 'Simulation request failed')
  }
}

export const getAlertsFeed = async (limit = 10) => {
  try {
    const resp = await client.get('/alerts/feed', { params: { limit } })
    return resp.data
  } catch (_) {
    return []
  }
}

export const generateReport = async (payload) => {
  try {
    const resp = await client.post('/report/generate', payload)
    return resp.data
  } catch (err) {
    throw new Error(err.response?.data?.detail || 'Report generation failed')
  }
}

export const sendReport = async (recipients, report, alertId = null) => {
  try {
    const resp = await client.post('/report/send', { recipients, report, alert_id: alertId ?? null })
    return resp.data
  } catch (err) {
    throw new Error(err.response?.data?.detail || 'Report send failed')
  }
}

function _mockCrisisAnalytics(days) {
  const now = new Date()
  const incidents = [
    {
      id: 1,
      region: 'Tunis',
      risk_level: 'CRITICAL',
      scenario_label: 'Grid Overload — Demo',
      cascade_regions: ['Ariana', 'Ben Arous'],
      triggered_at: new Date(now - 2 * 3600_000).toISOString(),
      report_sent: true,
      recipients_count: 3,
    },
    {
      id: 2,
      region: 'Sfax',
      risk_level: 'HIGH',
      scenario_label: 'Solar Dropout — Demo',
      cascade_regions: ['Mahdia'],
      triggered_at: new Date(now - 5 * 3600_000).toISOString(),
      report_sent: false,
      recipients_count: 0,
    },
    {
      id: 3,
      region: 'Bizerte',
      risk_level: 'ELEVATED',
      scenario_label: 'Wind Variance — Demo',
      cascade_regions: [],
      triggered_at: new Date(now - 26 * 3600_000).toISOString(),
      report_sent: false,
      recipients_count: 0,
    },
  ]
  const bucketDays = Math.min(days, 7)
  return {
    window_days: days,
    total_incidents: incidents.length,
    critical_count: 1,
    high_count: 1,
    most_affected_region: 'Tunis',
    report_dispatch_count: 1,
    cascade_hits_total: 3,
    incidents,
    region_frequency: [
      { region: 'Tunis', primary_count: 1, cascade_count: 0, total: 1 },
      { region: 'Ariana', primary_count: 0, cascade_count: 1, total: 1 },
      { region: 'Ben Arous', primary_count: 0, cascade_count: 1, total: 1 },
      { region: 'Sfax', primary_count: 1, cascade_count: 0, total: 1 },
      { region: 'Mahdia', primary_count: 0, cascade_count: 1, total: 1 },
      { region: 'Bizerte', primary_count: 1, cascade_count: 0, total: 1 },
    ],
    daily_counts: Array.from({ length: bucketDays }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (bucketDays - 1 - i))
      return {
        date: d.toISOString().slice(0, 10),
        count: i === bucketDays - 1 ? 2 : Math.floor(Math.random() * 2),
      }
    }),
  }
}

export const getCrisisAnalytics = async (days = 7) => {
  try {
    const res = await client.get('/analytics/crisis', { params: { days } })
    // Fall back to demo data when the DB has no incidents yet
    if (!res.data || res.data.total_incidents === 0) {
      return { data: _mockCrisisAnalytics(days), mock: true }
    }
    return { data: res.data, mock: false }
  } catch {
    return { data: _mockCrisisAnalytics(days), mock: true }
  }
}
