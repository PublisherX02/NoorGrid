# NoorGrid ⚡

Real-time renewable energy monitoring dashboard for Tunisia.

NoorGrid combines a **FastAPI** backend with a **Streamlit** frontend to give
operators a live view of wind, solar, and hydro energy production across five
key Tunisian governorates. Weather data is sourced from the free
[Open-Meteo API](https://open-meteo.com/) — no API key required.

---

## Project Structure

```
NoorGrid/
├── backend/
│   ├── main.py            # FastAPI app — all REST endpoints
│   ├── calculations.py    # Energy & carbon formulas
│   ├── models.py          # Pydantic request/response models
│   └── weather.py         # Open-Meteo fetcher for Tunisian coordinates
├── frontend/
│   └── app.py             # Streamlit dashboard
├── data/
│   └── steg_billing_sample.csv  # Sample STEG billing data
├── requirements.txt
├── .env.example
└── README.md
```

---

## Getting Started

### 1 — Install dependencies

```bash
pip install -r requirements.txt
```

### 2 — Configure environment

```bash
cp .env.example .env
# Edit .env if you want to change BACKEND_URL or add a TOMTOM_API_KEY
```

### 3 — Start the backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Interactive API docs: <http://localhost:8000/docs>

### 4 — Start the frontend (new terminal)

```bash
cd frontend
streamlit run app.py
```

Dashboard: <http://localhost:8501>

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Health check |
| `POST` | `/energy/wind` | Wind power (MW) — P = 0.5 × ρ × A × v³ × η |
| `POST` | `/energy/solar` | Solar power (MW) — P = G × A × η |
| `POST` | `/energy/hydro` | Hydro power (MW) — P = ρ × g × Q × H × η |
| `POST` | `/energy/carbon` | Carbon score (kg CO₂) — C = (E_consumed − E_renewable) × 0.468 |
| `GET`  | `/weather` | Live weather data for all five governorates |

### Example: Wind power

```bash
curl -X POST http://localhost:8000/energy/wind \
  -H "Content-Type: application/json" \
  -d '{"wind_speed": 8.5, "rotor_area": 7854, "efficiency": 0.40}'
```

---

## Governorates & Baselines

| Governorate | Source | Baseline |
|-------------|--------|----------|
| Bizerte     | Wind   | 97 MW    |
| Nabeul      | Wind   | 55 MW    |
| Tozeur      | Solar  | 20 MW    |
| Béja        | Hydro  | 33 MW    |
| Sidi Bouzid | Solar  | 100 MW   |

---

## Dashboard Features

- 🗺️ **Interactive map** — colour-coded markers (blue = normal, red = anomaly)
- 📋 **Sidebar** — click any governorate to jump to its detail view
- ⚠️ **Anomaly detection** — flags any site whose output drops >20% below baseline
- 🚁 **Drone dispatch** — simulated drone response with visual alert
- 📊 **STEG billing panel** — sample billing CSV rendered as a table
- 🌍 **National Carbon Index** — sum of regional carbon scores ÷ 11.8 M population

---

## Data Sources

- **Weather**: [Open-Meteo](https://open-meteo.com/) — free, no API key required
- **Billing**: placeholder CSV in `/data/steg_billing_sample.csv`
  (columns: `region`, `consumption_kwh`, `billing_period`)
