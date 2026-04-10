# NoorGrid ⚡
### Tunisia's Missing Energy Intelligence Infrastructure

---

## The Problem

On **August 14, 2024 at 15:41**, Tunisia's national grid hit a record **4,888 MW of demand** against an effective capacity of **4,636 MW**. The grid was over capacity. Algeria covered the 252 MW gap through the interconnector. Without them, Tunisia faces a cascading blackout.

This is not a hypothetical. This happens every summer.

We spoke directly with a senior official at STEG — Tunisia's national energy provider. He told us two things:

> *"There is no digital follow-up system for these grids. And there is no prevention mindset."*
>
> — Senior Official, STEG Renewable Energy Division, April 2026

Today, **93.7% of Tunisia's electricity comes from fossil fuels**. Renewables account for only **5-6% of 19,395 GWh** generated in 2024. Grid losses reached **22%**. Energy independence collapsed from **48% in 2023 to 41% in 2024**.

Tunisia has wind farms, solar plants, and hydroelectric dams scattered across 24 governorates. Each installation is monitored in isolation. There is no centralized real-time view. There is no prediction. There is no prevention.

**NoorGrid fixes that.**

---

## What NoorGrid Is

NoorGrid is Tunisia's first intelligent renewable energy operating system. It is not a dashboard. It is not a monitoring tool. It is the intelligence layer that has never existed.

Built on **FastAPI** (backend) and **Streamlit** (frontend), NoorGrid runs a continuous data loop across three pillars:

### Pillar 1 — Digital Twin
A real-time virtual replica of Tunisia's renewable grid. IoT sensors feed live data from wind farms, solar plants, and dams into a central intelligence core. When a turbine underperforms, the system detects it before the operator does. When wind drops below cut-in speed, it flags it. When a solar panel's output deviates from irradiance expectations, it dispatches an inspection drone automatically.

The system is time-aware: solar output is zero between 20:00-06:00 TUN. Wind anomalies are suppressed after 22:00. Hydro operates 24/7. These are not assumptions — they are physics.

### Pillar 2 — Blackout Prediction Engine
A 72-hour forecast model that computes grid stress using real temperature forecasts, peak-hour demand curves, and Tunisia's verified **5,944 MW total grid capacity** (22% losses → 4,636 MW effective).

When demand approaches effective capacity, the system fires a risk alert — before the blackout happens. This is the system that would have warned STEG 72 hours before August 14, 2024.

### Pillar 3 — National Carbon Index
Tunisia's first regionalized carbon score, calculated per governorate from real STEG billing data, live weather from OpenMeteo, and renewable production calculations. A number that has never existed before. NoorGrid creates it as a byproduct of running.

**National Carbon Index = Σ C_region / 11,800,000 population**

Every calculation NoorGrid runs becomes a public dataset. This is Tunisia's missing energy data foundation.

---

## The Stack

```
Physical World (IoT)
    Wind Turbine Sensors · Solar Panel Sensors · Dam Flow Sensors · Smart Grid Meters
            ↓
Data Ingestion
    OpenMeteo API (live weather) · STEG Billing CSV · TomTom POI API · FastAPI Backend
            ↓
Intelligence Core (AI)
    Anomaly Detection · Blackout Prediction (72h) · Carbon Score Calculator · NVIDIA NIM / Llama 3.1 70B
            ↓ Automated Decision
Action Layer
    Drone Dispatch System · STEG Operator Dashboard · Open Data Portal · AI Investment Advisor
            ↑
    Drone inspection data feeds back to IoT layer — continuous learning loop
```

---

## Mathematical Model

All formulas are implemented in `backend/calculations.py`.

### Wind Power

```
P_wind = 0.5 × ρ × A × v³ × η
```
- ρ = 1.225 kg/m³ (air density)
- A = rotor swept area (m²)
- v = wind speed from OpenMeteo (m/s)
- η = turbine efficiency (0.40)

### Solar Power

```
P_solar = G × A × η
```
- G = solar irradiance from OpenMeteo (W/m²)
- A = panel area (m²)
- η = panel efficiency (0.18)
- Output = 0 MW between 20:00-06:00 TUN (nighttime)

### Hydro Power

```
P_hydro = ρ_w × g × Q × H × η
```
- ρ_w = 1000.0 kg/m³ · g = 9.81 m/s²
- Q = flow rate (m³/s) · H = head height (m)
- η = turbine efficiency (0.88) — Sidi Salem Dam baseline: 33 MW

### Carbon Score

```
C = (E_consumed − E_renewable) × 0.468 kg CO₂/kWh
```
- E_consumed from STEG billing data
- E_renewable from live weather calculations
- 0.468 = Tunisia grid emission factor (kg CO₂/kWh)

### Blackout Risk Engine

```
Demand  = Baseline × (1 + max(0, (T−25) × 0.04)) × peak_hour_factor
Headroom = (4,636 − Demand) / 4,636 × 100%
```

| Headroom | Risk Level | Blackout Probability |
|----------|------------|----------------------|
| < 0% | CRITICAL | 95% |
| < 5% | CRITICAL | 75% |
| < 10% | HIGH | 55% |
| < 20% | ELEVATED | 30% |
| ≥ 20% | NOMINAL | < 5% |

**Reference event:** August 14, 2024 — demand 4,888 MW, effective capacity 4,636 MW, headroom −5.4% → CRITICAL. Algeria covered the gap.

**Prevention actions by risk level:**
- CRITICAL → Emergency load shedding + Transmed gas activation
- HIGH → Industrial demand reduction + reserve turbines
- ELEVATED → Demand response protocols + grid monitoring

### Trend-Based Composite Risk Scoring (Current Alert Logic)

NoorGrid now uses trend-aware scoring in the frontend operations layer instead of threshold-only alerts.

```
Risk Score = 0.40 × Deviation + 0.35 × RateOfChange + 0.25 × RegionalCorrelation
```

All components are normalized to a 0-100 range:

- **Deviation**: current output shortfall from expected output (time-aware baseline)
- **RateOfChange**: recent drop magnitude from history window (oldest to latest signal)
  - Wind regions use `wind_speed_ms`
  - Solar regions use `solar_irradiance_wm2`
- **RegionalCorrelation**: shared decline pressure when multiple regions drop together in the same window

Risk bands:

| Score | Level |
|-------|-------|
| < 35 | NOMINAL |
| 35-59.9 | ELEVATED |
| 60-79.9 | HIGH |
| >= 80 | CRITICAL |

UI impact:
- Ticker shows **risk level + score** per affected region
- Threat bar is driven by **max risk score** across all regions
- Region cards and selected region panel expose **risk components** for explainability

---

## Verified 2024 Grid Constants

Source: ONEM National Energy Balance 2024 + World Bank TEREG Program

| Metric | Value |
|--------|-------|
| Total installed capacity | 5,944 MW (25 plants) |
| STEG generation share | 95-96% of all electricity |
| Natural gas share | 94-95% of 19,395 GWh |
| Renewables share | 5-6% of generation |
| Grid losses | 22% (technical + non-technical) |
| Record peak demand | 4,888 MW — Aug 14, 2024 at 15:41 TUN |
| Algeria+Libya imports | 14% of Q3 2024 demand |
| Energy independence | 41% (down from 48% in 2023) |
| Effective capacity | 4,636 MW (after 22% losses) |

---

## Monitored Installations

| Governorate | Source | Baseline | Real Installation |
|-------------|--------|----------|-------------------|
| Bizerte | Wind | 97 MW | Métline + Kchabta Wind Farms |
| Nabeul | Wind | 55 MW | Sidi Daoud Wind Station |
| Tozeur | Solar | 20 MW | Centrale PV Tozeur |
| Béja | Hydro | 33 MW | Sidi Salem Dam |
| Sidi Bouzid | Solar | 100 MW | Mazouna/Al-Khabna Solar |

---

## Historical Storage

NoorGrid persists every weather snapshot to SQLite, enabling trend analysis over time.

- Default path: `data/noorgrid.db`
- Auto-created on first backend startup
- Every `/weather` call saves a row per governorate
- Query history via `GET /history/{region}?days=N`

**Schema:** `weather_history` table — region, latitude, longitude, wind_speed_ms, solar_irradiance_wm2, recorded_at

---

## AI Investment Advisor

Powered by **NVIDIA NIM — Meta Llama 3.1 70B Instruct**.

Feeds real-time dashboard data (carbon scores, anomalies, output vs baseline) into Llama 3.1 70B and returns:
- **Short term (0-2 years):** 3 specific investments with governorate, cost range, and expected MW gain
- **Long term (3-10 years):** 3 strategic infrastructure projects tied to Tunisia's 2035 targets
- **Critical risk:** The single most dangerous grid vulnerability and what NoorGrid prevents

Requires `NVIDIA_NIM_API_KEY` in `.env`.

---

## API Reference

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service health |
| POST | `/energy/wind` | Wind output (MW) |
| POST | `/energy/solar` | Solar output (MW) |
| POST | `/energy/hydro` | Hydro output (MW) |
| POST | `/energy/carbon` | Carbon score (kg CO₂) |
| GET | `/weather` | Live weather + auto-persist to SQLite |
| POST | `/history/record` | Manual weather snapshot insertion |
| GET | `/history/{region}?days=N` | Historical records (1-365 days) |
| POST | `/grid/simulate` | National demand/capacity/import simulation |
| POST | `/predict/blackout` | 72h blackout risk forecast |

Interactive docs: `http://localhost:8000/docs`

---

## Setup

### Install
```bash
pip install -r requirements.txt
```

### Configure `.env`
```env
BACKEND_URL=http://localhost:8000
NOORGRID_DB_PATH=data/noorgrid.db
NVIDIA_NIM_API_KEY=your_key_here
TOMTOM_API_KEY=your_key_here
```

### Run Backend
```bash
cd backend
uvicorn main:app --reload --port 8000
```

### Run Frontend
```bash
cd frontend
streamlit run app.py
```

Frontend: `http://localhost:8501`
Backend docs: `http://localhost:8000/docs`

### Run Tests
```bash
pytest -v
# 18 passed, 0 failed
```

---

## CI Quality Gates (GitHub Actions)

The CI workflow (`.github/workflows/ci.yml`) enforces:

1. **Lint**: `ruff check .`
2. **Type checks**: `mypy backend frontend`
3. **Tests + coverage threshold**:
   - `pytest ... --cov=backend --cov=frontend --cov-fail-under=80`

If any gate fails, the workflow fails and PR merge should be blocked by branch protection.

---

## National Grid Simulation Layer

NoorGrid includes a national simulation model for operational planning:

- Models **total demand vs effective capacity**
- Quantifies **deficit MW** and **import required MW**
- Computes **import reliance %**, **renewable share %**, and **headroom %**
- Returns a risk level and recommended action

### Core simulation model

```
cooling_surge = max(0, (temperature_c - 25) * 0.04)
base_demand = STEG_Q3_AVG_DEMAND_MW * peak_hour_factor * (1 + cooling_surge)
total_demand = base_demand * (1 + demand_delta_pct/100)

total_available = STEG_EFFECTIVE_CAPACITY_MW + reserve_capacity_mw
deficit = max(0, total_demand - total_available)
import_required = deficit
```

### Endpoint example

```bash
curl -X POST http://localhost:8000/grid/simulate ^
  -H "Content-Type: application/json" ^
  -d "{\"renewable_output_mw\":320,\"demand_delta_pct\":15,\"temperature_c\":41,\"include_peak_hour_factor\":true,\"reserve_capacity_mw\":200}"
```

The frontend exposes this through **National Grid Simulation Console** with live sliders.

---

## Data Sources

- [energiemines.gov.tn](https://energiemines.gov.tn) — ONEM National Energy Balance 2024
- [steg.com.tn](https://steg.com.tn) — STEG official production data
- [documents1.worldbank.org](https://documents1.worldbank.org) — World Bank TEREG Program
- [open-meteo.com](https://open-meteo.com) — Free real-time weather API (no key required)
- [enerdata.net](https://enerdata.net) — Tunisia & Algeria energy reports
- [eia.gov](https://eia.gov) — Country Analysis Brief: Algeria
- [global-climatescope.org](https://global-climatescope.org) — Climatescope 2025

---

## Context

Built in 6 days for a national ideathon on renewable energy optimization.
Field-validated by a senior official at STEG's renewable energy division.
The problem is real. The gap is real. NoorGrid is the answer.

*"There is no digital follow-up system for these grids. And there is no prevention mindset."*
*— Senior Official, STEG Renewable Energy Division, April 2026*
*— Senior Official, STEG Renewable Energy Division, April 2026*
