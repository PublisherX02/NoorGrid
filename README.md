# NoorGrid ⚡

NoorGrid is a Tunisia-focused renewable grid intelligence platform built with **FastAPI** (backend) and **Streamlit** (frontend). It calculates real-time wind/solar/hydro production, derives regional carbon impact, forecasts blackout risk, and now persists weather snapshots in **SQLite** for trend analysis.

---

## 1. What NoorGrid Does

NoorGrid runs a full data loop:

1. Pulls live weather for 5 governorates from Open-Meteo.
2. Converts weather + plant parameters into renewable output (MW).
3. Computes carbon score from consumption vs renewable generation.
4. Predicts blackout probability over forecast horizons.
5. Stores weather snapshots in SQLite.
6. Serves historical records used by the frontend trend chart.

---

## 2. System Architecture

### Backend (FastAPI)
- `backend/main.py`: API routes and orchestration
- `backend/calculations.py`: core math functions
- `backend/weather.py`: async weather fetcher (Open-Meteo)
- `backend/models.py`: request/response schemas
- `backend/db.py`: SQLite initialization + history I/O

### Frontend (Streamlit)
- `frontend/app.py`: operations dashboard, tactical UI, map, charts, prediction view, and historical trend section

### Data
- `data/steg_billing_sample.csv`: sample billing/consumption input
- `data/noorgrid.db`: SQLite history store (auto-created)

---

## 3. Mathematical Model (Exact Equations)

All formulas are implemented in `backend/calculations.py`.

### 3.1 Wind Power

\[
P_{wind} = 0.5 \times \rho \times A \times v^3 \times \eta
\]

- \( \rho \): air density (kg/m³), default `1.225`
- \( A \): rotor swept area (m²)
- \( v \): wind speed (m/s)
- \( \eta \): turbine efficiency (0..1)
- Result converted from W to MW using \(10^{-6}\)

### 3.2 Solar Power

\[
P_{solar} = G \times A \times \eta
\]

- \( G \): irradiance (W/m²)
- \( A \): panel area (m²)
- \( \eta \): panel efficiency (0..1)
- Result converted from W to MW

### 3.3 Hydro Power

\[
P_{hydro} = \rho_w \times g \times Q \times H \times \eta
\]

- \( \rho_w \): water density (`1000.0 kg/m³`)
- \( g \): gravity (`9.81 m/s²`)
- \( Q \): flow rate (m³/s)
- \( H \): head height (m)
- \( \eta \): efficiency (0..1)
- Result converted from W to MW

### 3.4 Carbon Score

\[
C = (E_{consumed} - E_{renewable}) \times I_c
\]

- \( E_{consumed} \): consumed energy (kWh)
- \( E_{renewable} \): renewable energy (kWh)
- \( I_c \): carbon intensity (`0.468 kg CO₂/kWh`)
- Output: kg CO₂

---

## 4. Blackout Prediction Logic

Endpoint: `POST /predict/blackout`

For each forecast hour:

1. **Demand estimate**
   - Cooling factor rises above 25°C:
   - `cooling_factor = max(0, (temp - 25) * 0.08)`
   - `estimated_demand_mw = baseline_mw * (1 + cooling_factor)`

2. **Available renewable power**
   - Wind regions: wind equation
   - Solar regions: solar equation
   - Hydro region: baseline fallback

3. **Stress ratio**
   - `stress_ratio = estimated_demand_mw / max(available_mw, 1.0)`

4. **Risk classification**
   - `> 4.0`: CRITICAL
   - `> 2.5`: HIGH
   - `> 1.5`: ELEVATED
   - else: NOMINAL

5. **Blackout probability**
   - `blackout_probability = clamp((stress_ratio - 1) * 25, 0, 100)`

---

## 5. SQLite Historical Storage

NoorGrid now includes a persisted weather history layer.

### 5.1 Database Path

- Default: `data/noorgrid.db`
- Override with environment variable:
  - `NOORGRID_DB_PATH=C:\path\to\custom.db`

### 5.2 Schema

Table: `weather_history`

- `id` INTEGER PK AUTOINCREMENT
- `region` TEXT
- `latitude` REAL
- `longitude` REAL
- `wind_speed_ms` REAL
- `solar_irradiance_wm2` REAL
- `recorded_at` TEXT (default `CURRENT_TIMESTAMP`)

### 5.3 Write Paths

- `GET /weather`:
  - Fetches live weather for all governorates
  - Automatically inserts entries into SQLite
- `POST /history/record`:
  - Manually persists provided weather entries

### 5.4 Read Path

- `GET /history/{region}?days=N`:
  - Returns records for `region` newer than `now - N days`
  - Ordered by most recent first
  - Validation: `days` must be `1..365`

---

## 6. Frontend Trend Section (Historical)

After selected governorate details, the dashboard renders:

- Title: `▸ 48H TREND — {REGION}`
- Data source: `GET {BACKEND_URL}/history/{selected_gov}?days=3`
- Chart behavior:
  - Wind governorates: plots `wind_speed_ms` over time
  - Other governorates: plots `solar_irradiance_wm2` over time
- Empty data message:
  - `COLLECTING DATA — check back after first weather fetch cycle.`
- Connection failure handling:
  - `TREND UNAVAILABLE — unable to connect to historical data service.`

The chart uses the same dark ops-room palette and typography as the rest of the dashboard.

---

## 7. API Reference

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Service health |
| `POST` | `/energy/wind` | Wind output (MW) |
| `POST` | `/energy/solar` | Solar output (MW) |
| `POST` | `/energy/hydro` | Hydro output (MW) |
| `POST` | `/energy/carbon` | Carbon score (kg CO₂) |
| `GET` | `/weather` | Live weather for all tracked governorates (also persists history) |
| `POST` | `/history/record` | Manual insertion of weather snapshots into SQLite |
| `GET` | `/history/{region}?days=7` | Historical weather snapshots for one region |
| `POST` | `/predict/blackout` | Forecasted blackout risk by hour |

Interactive docs: `http://localhost:8000/docs`

---

## 8. Governorates and Baselines

| Governorate | Source | Baseline |
|---|---|---|
| Bizerte | Wind | 97 MW |
| Nabeul | Wind | 55 MW |
| Tozeur | Solar | 20 MW |
| Béja | Hydro | 33 MW |
| Sidi Bouzid | Solar | 100 MW |

---

## 9. Environment Variables

| Variable | Used by | Default | Description |
|---|---|---|---|
| `BACKEND_URL` | Frontend | `http://localhost:8000` | Backend base URL for dashboard API calls |
| `NOORGRID_DB_PATH` | Backend | `data/noorgrid.db` | SQLite history file path |
| `NVIDIA_NIM_API_KEY` | Frontend advisor block | empty | API key for NVIDIA NIM integration |
| `TOMTOM_API_KEY` | Optional integrations | empty | Optional TomTom features |

---

## 10. Setup and Run

### 10.1 Install

```bash
pip install -r requirements.txt
```

### 10.2 Configure `.env`

Create `.env` in repo root:

```env
BACKEND_URL=http://localhost:8000
NOORGRID_DB_PATH=data/noorgrid.db
NVIDIA_NIM_API_KEY=
TOMTOM_API_KEY=
```

### 10.3 Start Backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 10.4 Start Frontend

```bash
cd frontend
streamlit run app.py
```

Frontend: `http://localhost:8501`  
Backend docs: `http://localhost:8000/docs`

---

## 11. Example Requests

### Wind output

```bash
curl -X POST http://localhost:8000/energy/wind ^
  -H "Content-Type: application/json" ^
  -d "{\"wind_speed\": 8.5, \"rotor_area\": 7854, \"efficiency\": 0.40}"
```

### Live weather (also writes SQLite history)

```bash
curl http://localhost:8000/weather
```

### Region history (last 3 days)

```bash
curl "http://localhost:8000/history/Bizerte?days=3"
```

### Blackout prediction

```bash
curl -X POST http://localhost:8000/predict/blackout ^
  -H "Content-Type: application/json" ^
  -d "{\"region\":\"Bizerte\",\"forecast_hours\":24}"
```

---

## 12. Testing

Run test suite:

```bash
pytest -q
```

Targeted history tests:

```bash
pytest -q tests/test_history.py
```

---

## 13. Known Behavior Notes

- Historical trends appear after at least one successful `/weather` cycle or manual `/history/record`.
- The history endpoint is region-string exact match.
- If backend connectivity fails, frontend trend section degrades gracefully with a user-facing message.

