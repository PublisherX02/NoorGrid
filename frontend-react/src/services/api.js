import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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
      stress > 4.0 ? 'CRITICAL' :
        stress > 2.5 ? 'HIGH' :
          stress > 1.5 ? 'ELEVATED' : 'NOMINAL'
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
    const score = Math.max(0, (consumption_kwh - renewable_kwh) * 0.468)
    return { region, carbon_score_kg: +score.toFixed(2) }
  }
}

// ─── RAG Chatbot ──────────────────────────────────────────────────────────────
// Primary: POST /rag/query — handled by FastAPI + NVIDIA NIM LLM backend.
// Fallback: local mock knowledge base when the backend is offline.
// Guardrails are enforced by the LLM system prompt, not by frontend keyword matching.

function _mockRAGResponse(message, context) {
  const q = message.toLowerCase()

  // ── Context-aware: current simulation state ──
  if (context?.simResult && (q.includes('current') || q.includes('now') || q.includes('this') || q.includes('simulat') || q.includes('scenario') || q.includes('result'))) {
    const r = context.simResult
    const p = context.simParams || {}
    return `CURRENT SIMULATION STATE

Risk Level      : ${r.risk_level}  (score ${r.risk_score?.toFixed(0)}/100)
Total Demand    : ${r.total_demand_mw?.toLocaleString(undefined, { maximumFractionDigits: 0 })} MW
Effective Cap.  : ${r.effective_capacity_mw?.toLocaleString(undefined, { maximumFractionDigits: 0 })} MW
Headroom        : ${r.headroom_pct?.toFixed(1)}%  ${r.headroom_pct < 0 ? '⚠  DEFICIT' : '✓  Surplus'}
Renewable Share : ${r.renewable_share_pct?.toFixed(1)}%
Import Required : ${r.import_required_mw?.toFixed(0)} MW
Temperature     : ${p.temperature_c}°C  →  cooling ×${(1 + (r.drivers?.cooling_surge_factor || 0)).toFixed(3)}

Recommended Action:
${r.recommended_action}

${r.risk_level === 'CRITICAL'
        ? 'IMMEDIATE: Contact STEG National Dispatch Center — Code Red protocol. Pre-authorize Algeria Transmed import.'
        : r.risk_level === 'HIGH'
          ? 'Pre-authorize Algeria reserve import. Notify large industrial consumers of 20-min curtailment window.'
          : r.risk_level === 'ELEVATED'
            ? 'Enable 15-min substation polling. Pre-position reserve capacity on standby.'
            : 'Grid operating within safe parameters. Standard 24-hour monitoring cycle.'}`
  }

  // ── August 14 2024 crisis ──
  if (q.includes('aug') || q.includes('14') || q.includes('crisis') || q.includes('record') || (q.includes('worst') && q.includes('event'))) {
    return `AUGUST 14, 2024 — GRID CRISIS RECORD

Tunisia's worst grid stress event on record:

▸  Peak demand    : 4,888 MW at 15:41 local time
▸  Grid capacity  : 4,636 MW effective — exceeded by 252 MW
▸  Temperature    : 45°C (northern + central regions)
▸  Cooling surge  : AC loads spiked 38% above seasonal baseline
▸  Duration       : Code Red held for 4h 22min (14:55–19:17)

Emergency Response Activated:
1. Full Transmed Algeria import (252 MW) — maximum capacity
2. Industrial load shedding: Tunis, Sfax, Sousse (−180 MW)
3. Commercial HVAC curtailment across 3 governorates
4. Ministry of Energy national emergency declaration

Root Cause Analysis:
The 93.7% fossil generation mix left no renewable buffer. Zero battery storage meant no sub-minute reserve to absorb the demand spike. The Algeria interconnector was the only circuit breaker.

NoorGrid: Replay this event via ⚠ Replay Aug 14 2024 in the Simulation Console.`
  }

  // ── STEG capacity / infrastructure ──
  if (q.includes('capacit') || q.includes('infrastructure') || q.includes('installed') || (q.includes('steg') && !q.includes('target'))) {
    return `STEG NATIONAL GRID — CAPACITY OVERVIEW

Installed Capacity    : 5,944 MW  (nameplate)
Effective Capacity    : 4,636 MW  (after 22% grid losses + reserve)
Peak Demand Record    : 4,888 MW  (Aug 14, 2024)
Safety Headroom       : −252 MW   at peak  →  Algeria covered deficit

Generation Mix (2024):
▸  Natural gas / oil  : 93.7%  ← stranded-asset risk post-2030
▸  Renewable          :  6.0%  (target: 35% by 2030)
▸  Hydro (seasonal)   :  0.3%

Transmission Network:
▸  400 kV backbone   : Tunis ↔ Sfax ↔ Sousse corridor
▸  225 kV regional   : Southern + western distribution
▸  Algeria (Transmed): 600 MW HVDC — 14% of peak demand
▸  Libya link        : 100 MW — low utilization, reliability concerns

Energy Independence: 41% in 2024 (down from 48% in 2023)
Source: STEG Annual Report 2024 · NoorGrid model v1.0`
  }

  // ── Renewable energy ──
  if (q.includes('renew') || q.includes('solar') || q.includes('wind') || q.includes('clean') || q.includes('green') || q.includes('hydro') || q.includes('target')) {
    return `TUNISIA RENEWABLE ENERGY RESOURCES

National Targets:
▸  2027 target    : 15% renewable share
▸  2030 target    : 35% renewable share
▸  Current (2024) : 6.0%  →  29-point gap to close

Solar Resources (top sites):
▸  Sidi Bouzid   : 750 W/m²  ·  100 MW installed (largest solar zone)
▸  Tozeur        : 820 W/m²  ·  20 MW  (Saharan prime site)
▸  Gafsa/Kebili  : 800–860 W/m²  ·  prime expansion corridors

Wind Resources:
▸  Kasserine     : 8.5 m/s avg  ·  75 MW  ·  highest capacity factor
▸  Bizerte       : 8.2 m/s     ·  97 MW  ·  Tunisia's largest wind farm
▸  Kef           : 7.8 m/s     ·  45 MW  ·  capacity factor ~0.42

Hydro (seasonal):
▸  Béja (Sidi Salem dam) : 33 MW  ·  Oct–Apr operation
▸  Jendouba (Oued Mellègue): 42 MW

Investment Priority: NoorGrid analysis recommends Sidi Bouzid solar expansion + Kasserine wind as highest ROI corridors for 2025–2030.`
  }

  // ── Algeria / interconnection ──
  if (q.includes('alger') || q.includes('import') || q.includes('transmed') || q.includes('interconnect') || q.includes('export') || q.includes('depend')) {
    return `TUNISIA–ALGERIA ENERGY INTERCONNECTION

Transmed HVDC Link:
▸  Capacity      : 600 MW bidirectional
▸  Current use   : 252 MW import (14% of peak demand)
▸  Operator      : STEG ↔ Sonelgaz (Algeria)
▸  Emergency use : Activated Aug 14, 2024 at full capacity

Dependency Risk Assessment:
▸  Energy independence fell from 48% (2023) → 41% (2024)
▸  Disruption scenario: ~2h stabilization window needed without import
▸  Libya link (100 MW): low reliability, rarely utilized as backup

NoorGrid Strategic Recommendations:
1. Reduce Algeria dependency to <8% by 2030 via renewable buildout
2. Deploy 200 MW battery storage (Sfax + Tunis substations priority)
3. Activate demand-response program for 50,000+ enrolled consumers
4. Diversify: explore Tunisian–Italian submarine cable (ELMED project)

Policy Ref: STEG Energy Transition Plan 2023–2030, Article 14`
  }

  // ── Maintenance ──
  if (q.includes('mainten') || q.includes('schedule') || q.includes('outage') || q.includes('repair') || q.includes('inspect') || q.includes('downtime')) {
    return `STEG MAINTENANCE SCHEDULE — Q2/Q3 2025

Planned Windows:
  Sfax-Sud 225 kV switchgear     Apr 18–22
  Bizerte Wind Farm units 3–4    May 06–09
  Sidi Salem Hydro unit 2        May 20–23
  Tunis-Nord 400 kV              Jun 02–06
  Sousse HVDC converter          Jun 15–19
  Tozeur Solar inverter block    Jul 08–10

Scheduling Protocol (STEG Technical Circular 2025-07):
▸  Preferred window : 01:00–05:00 (off-peak, min demand)
▸  Demand threshold : Only proceed if national load < 2,800 MW
▸  Backup rule      : Algeria import pre-authorized for all 400 kV work

Unplanned Outage Response:
▸  T+0m   Automatic protection trip → regional isolation
▸  T+5m   STEG dispatch manual re-routing attempt
▸  T+15m  Algeria emergency import if deficit > 100 MW
▸  T+30m  Ministry notification if 3+ regions affected`
  }

  // ── Investment ──
  if (q.includes('invest') || q.includes('fund') || q.includes('budget') || q.includes('project') || q.includes('pipeline') || q.includes('financ')) {
    return `TUNISIA ENERGY INVESTMENT PIPELINE 2025–2030

Active Projects (committed):
  Sidi Bouzid Solar Phase 2   200 MW   €180M   EBRD co-financing
  Bizerte Offshore Wind       120 MW   €210M   EIB Green Loan
  Sfax Battery Storage        150 MWh   €65M   AfDB support
  Gafsa Solar Complex         100 MW    €88M   BEI + private
  Smart Grid Tunis Pilot      400k m    €42M   World Bank
  ─────────────────────────────────────────────────────
  Total committed pipeline :  €585M  (2025–2027)

NoorGrid ROI Benchmarks:
▸  Solar (Saharan zone)  : 22–26% capacity factor  ·  payback ~8 yrs
▸  Wind (northern coast) : 38–44% capacity factor  ·  payback ~7 yrs
▸  Hydro (seasonal)      : 18–22% capacity factor  ·  payback ~20 yrs
▸  Gas peakers           : Phasing out — stranded-asset risk post-2030

Green Climate Fund: Tunisia eligible for $240M window — next cycle Dec 2025.`
  }

  // ── Carbon / emissions ──
  if (q.includes('carbon') || q.includes('emission') || q.includes('co2') || q.includes('climat') || q.includes('pollut') || q.includes('ndc')) {
    return `TUNISIA NATIONAL CARBON METRICS

Current Baseline:
▸  Grid emission factor : 0.468 kg CO₂ / kWh  (STEG 2024)
▸  Carbon index         : 2.31 kg CO₂ / capita / day
▸  Trend                : −0.04 yr/yr  (improving — slowly)
▸  2030 target          : 1.80 kg CO₂ / cap / day

Electricity Sector Emissions:
▸  Annual total : 9,082 kt CO₂  (2024 estimate)
▸  vs 2020      : +8.4%  →  driven by fossil peaker expansion
▸  NDC gap      : −3,200 kt CO₂ needed to meet commitment

Regional Breakdown:
▸  Tunis + Ben Arous : 38% of national electricity emissions
▸  Sfax industrial   : 17%
▸  Southern regions  : 12%  (improving via solar additions)

Path to Target: NoorGrid scenario modelling shows ≥4,200 MW renewable capacity online by 2030 is required to meet Tunisia's NDC commitment.

Source: ANME (Agence Nationale pour la Maîtrise de l'Énergie) 2024`
  }

  // ── Risk methodology ──
  if (q.includes('risk') || q.includes('blackout') || q.includes('predict') || q.includes('probab') || q.includes('stress') || q.includes('score') || q.includes('method')) {
    return `NOOGRID BLACKOUT RISK METHODOLOGY

Risk Level Thresholds:
▸  CRITICAL   (75–100) : Cascade failure imminent — immediate action
▸  HIGH       (50–74)  : Significant stress — intervention required
▸  ELEVATED   (25–49)  : Monitoring mode — prepare response
▸  NOMINAL    (0–24)   : Normal operation — standard cycle

Composite Risk Score:
  Risk = 0.40 × DemandStress
       + 0.25 × TemperatureDeviation
       + 0.20 × RateOfChange
       + 0.15 × RegionalCorrelation

Component Definitions:
▸  Demand Stress       : (Demand / Capacity) ratio — dominant driver
▸  Temp Deviation      : Delta from 25°C × cooling surge multiplier
▸  Rate of Change      : MW/hour acceleration (runaway demand signal)
▸  Regional Correl.    : Simultaneous HIGH+ in 3+ governorates

Model Performance (backtest Aug 2023–Jul 2024):
▸  Recall on HIGH+ events : 91%
▸  False positive rate    : 6.2%
▸  Avg lead time          : 47 minutes before threshold breach

Update frequency: every 5 minutes during peak hours (10:00–20:00)
Source: NoorGrid Prediction Engine v1.0 · STEG data partnership`
  }

  // ── Default domain fallback ──
  return `STEG KNOWLEDGE BASE — TOPICS AVAILABLE

I can answer questions on:

▸  Grid Capacity & Infrastructure
     STEG's 5,944 MW asset base, transmission network
▸  August 14, 2024 Crisis
     Tunisia's worst grid event — causes, response, lessons
▸  Renewable Energy Resources
     Solar, wind, hydro data by governorate
▸  Algeria–Tunisia Interconnection
     Transmed 600 MW HVDC link, dependency risk
▸  Blackout Risk Methodology
     How NoorGrid calculates composite risk scores
▸  Maintenance Schedules
     Q2–Q3 2025 planned outage windows
▸  Investment Pipeline
     2025–2030 projects (€585M committed)
▸  Carbon & Emissions
     0.468 kg CO₂/kWh baseline, NDC commitments

Example queries:
  "What caused the August 14 crisis?"
  "Show Tunisia's renewable capacity by site"
  "How is the composite risk score calculated?"`
}

export const sendMessageToRAG = async (message, context = {}) => {
  // Try live backend (FastAPI + NVIDIA NIM) first
  try {
    const res = await client.post('/rag/query', { message, context }, { timeout: 32000 })
    return {
      content: res.data.response || '',
      mock: false,
      rejected: res.data.rejected || false,
    }
  } catch {
    // Backend offline — fall back to local mock knowledge base
    return { content: _mockRAGResponse(message, context), mock: true, rejected: false }
  }
}
