"""
NoorGrid — Military Operations Room Dashboard
"""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

# Load .env file so NVIDIA_NIM_API_KEY and other secrets are available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed — keys must be set as system env vars

NIM_API_KEY = os.getenv("NVIDIA_NIM_API_KEY", "")
APP_LOGO_PATH = Path(__file__).resolve().parents[1] / "channels4_profile.jpg"
APP_ICON = str(APP_LOGO_PATH) if APP_LOGO_PATH.exists() else "⚡"

st.set_page_config(
    page_title="NOORGRID OPS",
    page_icon=APP_ICON,
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Constants ─────────────────────────────────────────────────────────────────
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
TUNISIA_POPULATION = 11_800_000
BILLING_PERIOD_HOURS = 3

GOVERNORATES: list[dict] = [
    {
        "name": "Bizerte",
        "source": "Wind",
        "lat": 37.2744,
        "lon": 9.8739,
        "baseline_mw": 97.0,
        "rotor_area": 7854.0,
        "efficiency": 0.40,
    },
    {
        "name": "Nabeul",
        "source": "Wind",
        "lat": 36.4561,
        "lon": 10.7376,
        "baseline_mw": 55.0,
        "rotor_area": 4418.0,
        "efficiency": 0.40,
    },
    {
        "name": "Tozeur",
        "source": "Solar",
        "lat": 33.9197,
        "lon": 8.1335,
        "baseline_mw": 20.0,
        "panel_area": 120_000.0,
        "efficiency": 0.18,
    },
    {
        "name": "Béja",
        "source": "Hydro",
        "lat": 36.7256,
        "lon": 9.1817,
        "baseline_mw": 33.0,
        "flow_rate": 150.0,
        "head_height": 25.0,
        "efficiency": 0.88,
    },
    {
        "name": "Sidi Bouzid",
        "source": "Solar",
        "lat": 35.0382,
        "lon": 9.4858,
        "baseline_mw": 100.0,
        "panel_area": 600_000.0,
        "efficiency": 0.18,
    },
]

SOURCE_ICON = {"Wind": "💨", "Solar": "☀️", "Hydro": "💧"}
WIND_OPERATIONAL_THRESHOLD_MS = 3.0
RISK_WEIGHTS = {
    "deviation": 0.40,
    "rate_of_change": 0.35,
    "regional_correlation": 0.25,
}

# ── VERIFIED 2024 STEG Grid Constants — Source: ONEM National Energy Balance ──
# Total installed: 5,944 MW across 25 plants. STEG controls 92.1% of capacity.
# Natural gas: 94-95% of 19,395 GWh generated. Renewables: only 5-6%.
# RECORD peak demand: 4,888 MW — August 14, 2024 at 15:41 TUN (EXACT)
# Grid losses: 22% of gross output (technical + non-technical)
# Algeria+Libya covered 14% of total demand in Q3 2024
# Energy independence: 48% (2023) → 41% (2024) — structural collapse
# On Aug 14 2024: 4,888 MW demand vs 4,636 MW effective = grid over capacity
# Algeria covered the 252 MW gap. Without them: cascading blackout.
STEG_TOTAL_CAPACITY_MW     = 5_944.0   # Exact 2024 nameplate (25 plants)
STEG_GAS_CAPACITY_MW       = 5_630.0   # 94.7% thermal generation
STEG_GRID_LOSS_FACTOR      = 0.22      # 22% official 2024 (up from 21% in 2022)
STEG_PEAK_DEMAND_MW        = 4_888.0   # EXACT record Aug 14 2024 at 15:41 TUN
STEG_BASELINE_DEMAND_MW    = 2_800.0   # Off-peak baseline demand
STEG_Q3_AVG_DEMAND_MW      = 3_800.0   # Summer average demand
STEG_IMPORT_DEPENDENCY     = 0.14      # Algeria+Libya share of Q3 2024 demand
# Effective capacity = 5,944 × 0.78 = 4,636 MW after losses and derating
STEG_EFFECTIVE_CAPACITY_MW = STEG_TOTAL_CAPACITY_MW * (1 - STEG_GRID_LOSS_FACTOR)

# ── Military ops-room CSS ─────────────────────────────────────────────────────
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');

    /* ── Global ──────────────────────────────────────────── */
    html, body, [data-testid="stAppViewContainer"], [data-testid="stApp"] {
        background-color: #020408 !important;
        color: #c9d1d9;
    }
    *, *::before, *::after {
        font-family: 'JetBrains Mono', 'Courier New', Courier, monospace !important;
    }
    [data-testid="stSidebar"] {
        background-color: #040810 !important;
        border-right: 1px solid #00ff8825;
    }

    /* ── Animations ──────────────────────────────────────── */
    @keyframes blink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.05; }
    }
    @keyframes ticker-scroll {
        0%   { transform: translateX(100vw); }
        100% { transform: translateX(-100%); }
    }
    .blink { animation: blink 1s step-end infinite; }

    /* ── Header ──────────────────────────────────────────── */
    .ops-header {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        align-items: center;
        padding: 10px 24px;
        background: #040810;
        border-bottom: 1px solid #00ff8830;
        margin-bottom: 0;
    }
    .header-logo {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #00ff88;
        font-weight: 700;
        font-size: 1.35em;
        letter-spacing: 0.14em;
    }
    .header-logo img {
        width: 34px;
        height: 34px;
        border-radius: 6px;
        object-fit: cover;
        border: 1px solid #00ff8840;
    }
    .header-clock {
        color: #06b6d4;
        font-size: 1.2em;
        text-align: center;
        letter-spacing: 0.1em;
    }
    .header-status {
        color: #00ff88;
        font-size: 0.8em;
        text-align: right;
        letter-spacing: 0.07em;
    }

    /* ── Ticker ──────────────────────────────────────────── */
    .ticker-wrap {
        width: 100%;
        overflow: hidden;
        background: #030609;
        border-top: 1px solid #ff333325;
        border-bottom: 1px solid #ff333325;
        padding: 5px 0;
    }
    .ticker-content {
        display: inline-block;
        white-space: nowrap;
        animation: ticker-scroll 55s linear infinite;
        font-size: 0.77em;
        letter-spacing: 0.05em;
    }
    .ticker-alert  { color: #ff3333; }
    .ticker-normal { color: #00ff88; }

    /* ── Sidebar metric blocks ───────────────────────────── */
    .metric-block {
        background: #050c14;
        border: 1px solid #00ff8828;
        border-radius: 4px;
        padding: 14px 16px;
        margin-bottom: 10px;
        box-shadow: 0 0 8px #00ff8812;
    }
    .metric-block.alert {
        border-color: #ff333355;
        box-shadow: 0 0 10px #ff333320;
    }
    .metric-label {
        font-size: 0.62em;
        color: #3d4a5a;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        margin-bottom: 6px;
    }
    .metric-value       { font-size: 1.75em; font-weight: 700; color: #00ff88; line-height: 1.1; }
    .metric-value.alert { color: #ff3333; }
    .metric-value.cyan  { color: #06b6d4; }
    .metric-unit        { font-size: 0.38em; color: #3d4a5a; vertical-align: middle; margin-left: 4px; }

    /* ── Section headers ─────────────────────────────────── */
    .section-hdr {
        font-size: 0.68em;
        color: #00ff88;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        border-bottom: 1px solid #00ff8825;
        padding-bottom: 5px;
        margin: 20px 0 12px;
    }
    .section-hdr.alert { color: #ff3333; border-color: #ff333325; }

    /* ── Terminal buttons ────────────────────────────────── */
    .stButton > button {
        font-family: 'JetBrains Mono', monospace !important;
        background: #040810 !important;
        color: #00ff88 !important;
        border: 1px solid #00ff8835 !important;
        border-radius: 3px !important;
        font-size: 0.76em !important;
        letter-spacing: 0.05em !important;
        text-align: left !important;
        padding: 6px 12px !important;
        width: 100%;
    }
    .stButton > button:hover {
        background: #00ff8812 !important;
        border-color: #00ff8870 !important;
    }

    /* ── Governorate cards ───────────────────────────────── */
    .gov-card {
        background: #0a0f1a;
        border: 1px solid #00ff8835;
        border-radius: 5px;
        padding: 14px 16px;
        height: 100%;
    }
    .gov-card.anomaly {
        border-color: #ff3333;
        box-shadow: 0 0 16px #ff333330;
    }
    .gov-title         { font-size: 0.92em; font-weight: 700; color: #00ff88; margin-bottom: 9px; letter-spacing: 0.04em; }
    .gov-title.anomaly { color: #ff3333; }
    .gov-row           { font-size: 0.76em; color: #5a6a7a; margin: 5px 0; }
    .gov-row span      { color: #06b6d4; font-weight: 700; }
    .src-badge {
        display: inline-block;
        font-size: 0.62em;
        padding: 1px 6px;
        border-radius: 2px;
        font-weight: 600;
        margin-left: 5px;
        letter-spacing: 0.04em;
    }
    .badge-wind  { background: #0d1a2d; color: #388bfd; border: 1px solid #388bfd40; }
    .badge-solar { background: #1c1500; color: #d29922; border: 1px solid #d2992240; }
    .badge-hydro { background: #001a0d; color: #3fb950; border: 1px solid #3fb95040; }
    .wind-ctx {
        font-size: 0.7em;
        color: #3d4a5a;
        border-left: 2px solid #388bfd;
        padding-left: 8px;
        margin-top: 8px;
        line-height: 1.5;
    }
    .drone-alert {
        margin-top: 8px;
        padding: 6px 10px;
        background: #140404;
        border: 1px solid #ff3333;
        border-radius: 3px;
        color: #ff3333;
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.08em;
        animation: blink 1.4s step-end infinite;
    }
    .drone-alert.static { animation: none; }

    /* ── Metric widget overrides ─────────────────────────── */
    [data-testid="metric-container"] {
        background: #0a0f1a !important;
        border: 1px solid #00ff8830 !important;
        border-radius: 4px !important;
        padding: 10px 14px !important;
    }
    [data-testid="stMetricValue"] { color: #06b6d4 !important; }
    [data-testid="stMetricLabel"] { color: #3d4a5a !important; font-size: 0.7em !important; letter-spacing: 0.1em !important; }

    /* ── Carbon panel ────────────────────────────────────── */
    .carbon-panel {
        background: #040810;
        border: 1px solid #06b6d428;
        border-radius: 5px;
        padding: 24px;
        text-align: center;
        margin-top: 16px;
        box-shadow: 0 0 22px #06b6d412;
    }
    .carbon-value { font-size: 2.9em; font-weight: 700; color: #06b6d4; }
    .carbon-label { font-size: 0.68em; color: #3d4a5a; letter-spacing: 0.1em; margin-top: 8px; line-height: 1.9; }

    /* ── Scan lines (CRT overlay) ────────────────────────── */
    body::after {
        content: '';
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,255,136,0.015) 2px,
            rgba(0,255,136,0.015) 4px
        );
        pointer-events: none;
        z-index: 9999;
    }

    /* ── Threat level bar ────────────────────────────────── */
    .threat-bar {
        display: flex;
        width: 100%;
        border-top: 1px solid #0a0f1a;
    }
    .threat-seg {
        flex: 1;
        padding: 6px 0;
        text-align: center;
        font-size: 0.62em;
        letter-spacing: 0.13em;
        font-weight: 700;
        opacity: 0.22;
    }
    .threat-seg.active {
        opacity: 1;
        animation: blink 2.2s step-end infinite;
    }

    /* ── Mission log ─────────────────────────────────────── */
    .log-panel {
        background: #020408;
        border: 1px solid #00ff8815;
        border-radius: 4px;
        padding: 10px 12px;
        max-height: 190px;
        overflow-y: auto;
        line-height: 1.75;
    }
    .log-line       { font-size: 0.63em; color: #2a3a4a; }
    .log-line.warn  { color: #7a2020; }
    .log-line.ok    { color: #1a4a2a; }
    .log-ts         { color: #1a2a1a; margin-right: 4px; }
    .log-line.warn .log-ts { color: #4a1a1a; }
    .log-line.ok   .log-ts { color: #1a3a2a; }

    /* ── Hide Streamlit chrome ───────────────────────────── */
    #MainMenu, footer { visibility: hidden; }
    [data-testid="stToolbar"] { display: none; }
    </style>
    """,
    unsafe_allow_html=True,
)

# ── Session state ─────────────────────────────────────────────────────────────
if "selected_gov" not in st.session_state:
    st.session_state.selected_gov = GOVERNORATES[0]["name"]
if "drone_dispatched" not in st.session_state:
    st.session_state.drone_dispatched = set()
if "mission_log" not in st.session_state:
    st.session_state.mission_log = []
if "anomaly_logged" not in st.session_state:
    st.session_state.anomaly_logged = set()
if "dispatch_logged" not in st.session_state:
    st.session_state.dispatch_logged = set()
if "animating_drones" not in st.session_state:
    st.session_state.animating_drones = set()
if "drones_to_report" not in st.session_state:
    st.session_state.drones_to_report = []

@st.dialog("🚁 DRONE INSPECTION REPORT")
def display_drone_report(targets, gov_data_list):
    st.markdown("### 🚁 Automated Assessment Complete")
    st.write("The following sites have been surveyed by operations:")
    for t in targets:
        gov = next((g for g in gov_data_list if g["name"] == t), {})
        st.markdown("---")
        st.markdown(f"**TARGET:** {t} ({gov.get('source', 'Unknown')})")
        if gov.get('source') == "Solar":
            st.warning("🚨 **LIDAR SCAN:** Extreme particulate accumulation on PV array blocking irradiance.\n\n🚨 **INFRARED:** Inverter block #4 operating beyond thermal limits. High risk of ignition.")
        else:
            st.warning("🚨 **ANEMOMETER SCAN:** Blade structural integrity warning. Micro-fractures detected.\n\n🚨 **GEARBOX:** Lubrication pressure drop detected in Turbine #7. Imminent stall.")
    
    if st.button("Acknowledge & Sync to Operations Log", type="primary"):
        st.session_state.drones_to_report = []
        st.rerun()

# ── Backend logic (unchanged) ─────────────────────────────────────────────────

@st.cache_data(ttl=300)
def get_weather() -> dict[str, dict]:
    """Fetch weather from backend; cache for 5 minutes."""
    try:
        resp = httpx.get(f"{BACKEND_URL}/weather", timeout=15)
        resp.raise_for_status()
        raw = resp.json()["data"]
        return {row["region"]: row for row in raw}
    except Exception:
        return {}


def estimate_output(gov: dict, weather: dict) -> float:
    w = weather.get(gov["name"], {})
    # Tunisia time = UTC+1
    tunis_hour = (datetime.now(timezone.utc) + timedelta(hours=1)).hour

    try:
        if gov["source"] == "Wind":
            speed = w.get("wind_speed_ms", 0.0)
            if speed <= 0:
                # No wind data — return 0, not baseline
                return 0.0
            resp = httpx.post(
                f"{BACKEND_URL}/energy/wind",
                json={
                    "wind_speed": speed,
                    "rotor_area": gov["rotor_area"],
                    "efficiency": gov["efficiency"],
                },
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json()["power_mw"]

        if gov["source"] == "Solar":
            irr = w.get("solar_irradiance_wm2", 0.0)
            # Nighttime: solar produces nothing — don't fake it with baseline
            if tunis_hour < 6 or tunis_hour >= 20:
                return 0.0
            if irr <= 0:
                # Daytime but irradiance is 0 (cloudy) — return 0, not baseline
                return 0.0
            resp = httpx.post(
                f"{BACKEND_URL}/energy/solar",
                json={
                    "irradiance": irr,
                    "panel_area": gov["panel_area"],
                    "efficiency": gov["efficiency"],
                },
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json()["power_mw"]

        if gov["source"] == "Hydro":
            resp = httpx.post(
                f"{BACKEND_URL}/energy/hydro",
                json={
                    "flow_rate": gov["flow_rate"],
                    "head_height": gov["head_height"],
                    "efficiency": gov["efficiency"],
                },
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json()["power_mw"]

    except Exception:
        pass

    # Hydro fallback only — wind and solar should never fake output
    if gov["source"] == "Hydro":
        return gov["baseline_mw"] * 0.75
    return 0.0


def get_carbon(gov_name: str, consumption_kwh: float, renewable_kwh: float) -> float:
    try:
        resp = httpx.post(
            f"{BACKEND_URL}/energy/carbon",
            json={
                "region": gov_name,
                "consumption_kwh": consumption_kwh,
                "renewable_kwh": renewable_kwh,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()["carbon_score_kg"]
    except Exception:
        return (consumption_kwh - renewable_kwh) * 0.468


def simulate_national_grid(
    renewable_output_mw: float,
    demand_delta_pct: float,
    temperature_c: float,
    include_peak_hour_factor: bool,
    reserve_capacity_mw: float,
) -> dict:
    try:
        resp = httpx.post(
            f"{BACKEND_URL}/grid/simulate",
            json={
                "renewable_output_mw": renewable_output_mw,
                "demand_delta_pct": demand_delta_pct,
                "temperature_c": temperature_c,
                "include_peak_hour_factor": include_peak_hour_factor,
                "reserve_capacity_mw": reserve_capacity_mw,
            },
            timeout=12,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return {}


def load_billing_data() -> pd.DataFrame:
    data_path = os.path.join(
        os.path.dirname(__file__), "..", "data", "steg_billing_sample.csv"
    )
    try:
        return pd.read_csv(data_path)
    except FileNotFoundError:
        return pd.DataFrame(columns=["region", "consumption_kwh", "billing_period"])


def wind_context_label(wind_spd: float) -> str:
    if wind_spd < WIND_OPERATIONAL_THRESHOLD_MS:
        return (
            f"Current wind: {wind_spd:.2f} m/s"
            f" — below {WIND_OPERATIONAL_THRESHOLD_MS:.0f} m/s operational threshold"
        )
    return f"Current wind: {wind_spd:.2f} m/s"


def get_expected_output(region: str, source_type: str, baseline_mw: float) -> float:
    tunis_hour = (datetime.now(timezone.utc) + timedelta(hours=1)).hour
    # Solar produces nothing at night — expected is 0, so anomaly threshold is 0
    if source_type == "Solar" and (tunis_hour < 6 or tunis_hour >= 20):
        return 0.0
    # Wind at night is valid — but don't flag calm nights as anomalies
    # Only flag wind anomaly during operational hours (06:00-22:00)
    if source_type == "Wind" and (tunis_hour < 6 or tunis_hour >= 22):
        return 0.0
    return baseline_mw


def is_anomaly(output_mw: float, baseline_mw: float, region: str = "", source_type: str = "") -> bool:
    expected = get_expected_output(region, source_type, baseline_mw)
    # No anomaly if expected is 0 (nighttime solar or late-night wind)
    if expected <= 0:
        return False
    return output_mw < expected * 0.8


@st.cache_data(ttl=300)
def get_history_series(region: str, days: int = 1) -> list[dict]:
    """Fetch historical weather snapshots for one region from backend SQLite API."""
    try:
        resp = httpx.get(f"{BACKEND_URL}/history/{region}", params={"days": days}, timeout=15)
        resp.raise_for_status()
        records = resp.json().get("records", [])
        return sorted(records, key=lambda r: r.get("recorded_at", ""))
    except Exception:
        return []


@st.cache_data(ttl=1800)
def get_hydro_forecast(months: int = 12) -> dict | None:
    try:
        resp = httpx.get(
            f"{BACKEND_URL}/hydro/forecast",
            params={"months": months},
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return None


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _signal_values_for_source(history_records: list[dict], source_type: str) -> list[float]:
    if source_type == "Wind":
        return [
            float(r.get("wind_speed_ms", 0.0))
            for r in history_records
            if r.get("wind_speed_ms") is not None
        ]
    if source_type == "Solar":
        return [
            float(r.get("solar_irradiance_wm2", 0.0))
            for r in history_records
            if r.get("solar_irradiance_wm2") is not None
        ]
    return []


def _compute_roc_drop_pct(history_records: list[dict], source_type: str) -> float:
    """Return positive % drop magnitude based on oldest -> newest signal in window."""
    vals = _signal_values_for_source(history_records, source_type)
    if len(vals) < 2:
        return 0.0
    start = max(vals[0], 1e-6)
    end = vals[-1]
    change_pct = ((end - start) / start) * 100.0
    return max(0.0, -change_pct)


def _risk_level_from_score(score: float) -> str:
    if score >= 80:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 35:
        return "ELEVATED"
    return "NOMINAL"


def apply_trend_risk_scoring(rows: list[dict], scenario: str = "NOMINAL (Live Data)") -> list[dict]:
    """Compute composite risk using baseline deviation + ROC + regional correlation."""
    # Scenario runs are synthetic; keep alerts tied to the simulation output itself.
    if "NOMINAL" not in scenario:
        for row in rows:
            expected = get_expected_output(row["name"], row["source"], row["baseline_mw"])
            deviation_pct = 0.0 if expected <= 0 else max(0.0, ((expected - row["output_mw"]) / expected) * 100.0)
            row["risk_components"] = {
                "deviation": round(_clamp(deviation_pct), 1),
                "rate_of_change": 0.0,
                "regional_correlation": 0.0,
            }
            row["risk_score"] = round(_clamp(deviation_pct), 1)
            row["risk_level"] = _risk_level_from_score(row["risk_score"])
            row["anomaly"] = row["risk_level"] in {"ELEVATED", "HIGH", "CRITICAL"}
        return rows

    history_by_region = {row["name"]: get_history_series(row["name"], days=1) for row in rows}
    roc_drop_by_region: dict[str, float] = {}
    for row in rows:
        roc_drop_by_region[row["name"]] = _compute_roc_drop_pct(
            history_by_region.get(row["name"], []),
            row["source"],
        )

    # Regional correlation: if many regions decline together, boost local risk.
    declining_regions = [name for name, drop in roc_drop_by_region.items() if drop >= 12.0]
    regional_ratio = len(declining_regions) / max(len(rows), 1)

    for row in rows:
        expected = get_expected_output(row["name"], row["source"], row["baseline_mw"])
        deviation_pct = 0.0 if expected <= 0 else max(0.0, ((expected - row["output_mw"]) / expected) * 100.0)

        deviation_score = _clamp(deviation_pct)
        roc_score = _clamp(roc_drop_by_region[row["name"]] * 2.2)  # 45% drop ~= high risk
        corr_multiplier = 1.0 if roc_drop_by_region[row["name"]] >= 6.0 else 0.5
        regional_corr_score = _clamp(regional_ratio * 100.0 * corr_multiplier)

        risk_score = _clamp(
            deviation_score * RISK_WEIGHTS["deviation"]
            + roc_score * RISK_WEIGHTS["rate_of_change"]
            + regional_corr_score * RISK_WEIGHTS["regional_correlation"]
        )
        risk_level = _risk_level_from_score(risk_score)

        row["risk_components"] = {
            "deviation": round(deviation_score, 1),
            "rate_of_change": round(roc_score, 1),
            "regional_correlation": round(regional_corr_score, 1),
        }
        row["risk_score"] = round(risk_score, 1)
        row["risk_level"] = risk_level
        row["anomaly"] = risk_level in {"ELEVATED", "HIGH", "CRITICAL"}

    return rows


@st.cache_data(ttl=300)
def build_gov_data(scenario: str = "NOMINAL (Live Data)") -> list[dict]:
    weather = get_weather()
    billing_df = load_billing_data()
    rows = []
    for gov in GOVERNORATES:
        output = estimate_output(gov, weather)
        
        # Apply crisis simulation modifiers
        if "Sandstorm" in scenario and gov["source"] == "Solar":
            output *= 0.1
        if "Wind Drop" in scenario and gov["source"] == "Wind":
            output = 0.0
        if "Heatwave" in scenario:
            if gov["source"] == "Solar":
                output *= 0.85
            elif gov["source"] == "Wind":
                output *= 0.70
                
        gov_billing = billing_df[billing_df["region"] == gov["name"]]
        if not gov_billing.empty:
            consumption = gov_billing.iloc[-1]["consumption_kwh"]
        else:
            consumption = gov["baseline_mw"] * 1000 * BILLING_PERIOD_HOURS
        renewable_kwh = output * 1000 * BILLING_PERIOD_HOURS
        c_score = get_carbon(gov["name"], consumption, renewable_kwh)
        anomaly = is_anomaly(output, gov["baseline_mw"], gov["name"], gov["source"])
        wind_speed = (
            weather.get(gov["name"], {}).get("wind_speed_ms")
            if gov["source"] == "Wind"
            else None
        )
        rows.append({
            "name": gov["name"],
            "source": gov["source"],
            "lat": gov["lat"],
            "lon": gov["lon"],
            "baseline_mw": gov["baseline_mw"],
            "output_mw": round(output, 2),
            "carbon_score_kg": round(c_score, 1),
            "anomaly": anomaly,
            "wind_speed_ms": wind_speed,
        })
    return apply_trend_risk_scoring(rows, scenario)


# ── Live clock fragment (defined at module level to keep a stable fragment ID) ─
@st.fragment(run_every=1)
def _live_clock():
    now = datetime.now(timezone(timedelta(hours=1)))
    st.markdown(
        f'<div class="header-clock">'
        f'{now.strftime("%Y-%m-%d")} &nbsp;|&nbsp; {now.strftime("%H:%M:%S")} TUN'
        f'</div>',
        unsafe_allow_html=True,
    )


# ── Load data ─────────────────────────────────────────────────────────────────
current_scenario = st.session_state.get("scenario_key", "NOMINAL (Live Data)")
gov_data = build_gov_data(current_scenario)
hydro_forecast = get_hydro_forecast(12)
gov_lookup = {g["name"]: g for g in gov_data}
anomalous = [g for g in gov_data if g["anomaly"]]
total_mw = sum(g["output_mw"] for g in gov_data)
total_carbon = sum(g["carbon_score_kg"] for g in gov_data)
national_index = total_carbon / TUNISIA_POPULATION


# ── Mission log population ────────────────────────────────────────────────────
def _log(msg: str, kind: str = "info") -> None:
    ts = datetime.now(timezone(timedelta(hours=1))).strftime("%H:%M:%S")
    st.session_state.mission_log.append((ts, msg, kind))

if not st.session_state.mission_log:
    _log("SYSTEM ONLINE", "ok")
    _log(f"WEATHER DATA FETCHED — {len(gov_data)} REGIONS", "ok")

for g in anomalous:
    if g["name"] not in st.session_state.anomaly_logged:
        _log(
            f"RISK ELEVATED — {g['name']} {g['source']} "
            f"(score {g.get('risk_score', 0):.1f}, {g.get('risk_level', 'NOMINAL')})",
            "warn",
        )
        st.session_state.anomaly_logged.add(g["name"])

if st.session_state.get("agent_mode", False) and anomalous:
    for g in anomalous:
        if g["name"] not in st.session_state.drone_dispatched and g["name"] not in st.session_state.animating_drones:
            st.session_state.animating_drones.add(g["name"])
            _log(f"[AGENT] Detected critical output drop in {g['name']}. Auto-dispatching drone for inspection.", "ok")
            st.rerun()

for name in st.session_state.drone_dispatched:
    if name not in st.session_state.dispatch_logged:
        _log(f"DRONE DISPATCHED — {name}", "ok")
        st.session_state.dispatch_logged.add(name)


# ── Header ────────────────────────────────────────────────────────────────────
h_left, h_center, h_right = st.columns([1, 1.5, 1])

with h_left:
    if APP_LOGO_PATH.exists():
        _logo_col, _title_col = st.columns([0.18, 0.82], gap="small")
        with _logo_col:
            st.image(str(APP_LOGO_PATH), width=34)
        with _title_col:
            st.markdown('<div class="header-logo"><span>NOORGRID</span></div>', unsafe_allow_html=True)
    else:
        st.markdown('<div class="header-logo">⚡ NOORGRID</div>', unsafe_allow_html=True)

with h_right:
    st.markdown(
        '<div class="header-status">'
        'SYSTEM STATUS &nbsp;<span class="blink" style="color:#00ff88;font-size:1.1em">●</span>&nbsp; LIVE'
        '</div>',
        unsafe_allow_html=True,
    )

with h_center:
    _live_clock()

# ── Anomaly ticker ────────────────────────────────────────────────────────────
if anomalous:
    parts = []
    for g in anomalous:
        spd = f" — {g['wind_speed_ms']:.2f} m/s" if g.get("wind_speed_ms") is not None else ""
        status = " — DRONE DISPATCHED" if g["name"] in st.session_state.drone_dispatched else ""
        parts.append(
            f"⚠ {g.get('risk_level', 'ELEVATED')} RISK — {g['name']} {g['source']} "
            f"[{g.get('risk_score', 0):.1f}]"
            f"{spd}{status}"
        )
    # repeat to fill the scroll loop
    ticker_text = ("  ◆  ".join(parts) + "  ◆  ") * 4
    st.markdown(
        f'<div class="ticker-wrap">'
        f'<span class="ticker-content ticker-alert">{ticker_text}</span>'
        f'</div>',
        unsafe_allow_html=True,
    )
else:
    st.markdown(
        '<div class="ticker-wrap"><span class="ticker-content ticker-normal">'
        + ("● ALL SYSTEMS NOMINAL &nbsp;◆&nbsp; NO ANOMALIES DETECTED &nbsp;◆&nbsp; "
           "GRID OPERATING WITHIN BASELINE &nbsp;◆&nbsp; ") * 6
        + "</span></div>",
        unsafe_allow_html=True,
    )
# ── Override Command Console ──────────────────────────────────────────────────
st.markdown('<div class="section-hdr" style="margin-top:10px;">▸ OVERRIDE COMMAND CONSOLE</div>', unsafe_allow_html=True)

cc1, cc2, cc3, cc4, cc5 = st.columns([1,1,1,1,1.5])
with cc1:
    if st.button("🟢 NOMINAL OP", use_container_width=True):
        st.session_state.scenario_key = "NOMINAL (Live Data)"
        st.rerun()
with cc2:
    if st.button("🏜️ SANDSTORM", use_container_width=True):
        st.session_state.scenario_key = "CRISIS: Sahara Sandstorm"
        st.rerun()
with cc3:
    if st.button("🌬️ WIND DROP", use_container_width=True):
        st.session_state.scenario_key = "CRISIS: Wind Drop (0 m/s)"
        st.rerun()
with cc4:
    if st.button("🔥 HEATWAVE", use_container_width=True):
        st.session_state.scenario_key = "CRISIS: Extreme Heatwave"
        st.rerun()
with cc5:
    st.markdown('<div style="margin-top:5px;"></div>', unsafe_allow_html=True)
    st.toggle("🤖 AI DELEGATION PROTOCOL", key="agent_mode", help="Enable autonomous drone dispatch")

current_scen_display = st.session_state.get("scenario_key", "NOMINAL (Live Data)")
scen_color = "#00ff88" if "NOMINAL" in current_scen_display else "#ff3333"
st.markdown(
    f'<div style="text-align:center; padding:5px; border: 1px dashed {scen_color}80; color:{scen_color}; font-size:0.8em; margin-bottom:15px; background: {scen_color}10;">'
    f'ACTIVE PROTOCOL: <b>{current_scen_display.upper()}</b></div>',
    unsafe_allow_html=True
)
# ── Threat level indicator ────────────────────────────────────────────────────
_THREAT_LEVELS = [
    ("NOMINAL",   "#00ff88", "#001a0d"),
    ("ELEVATED",  "#d4e000", "#1a1900"),
    ("HIGH",      "#ff8800", "#1a0800"),
    ("CRITICAL",  "#ff3333", "#1a0000"),
    ("BLACKOUT",  "#660000", "#0d0000"),
]
_max_risk_score = max((g.get("risk_score", 0.0) for g in gov_data), default=0.0)
if _max_risk_score >= 80:
    _threat_idx = 3
elif _max_risk_score >= 60:
    _threat_idx = 2
elif _max_risk_score >= 35:
    _threat_idx = 1
else:
    _threat_idx = 0

segs_html = ""
for i, (label, color, bg) in enumerate(_THREAT_LEVELS):
    active = "active" if i == _threat_idx else ""
    segs_html += (
        f'<div class="threat-seg {active}" '
        f'style="background:{bg};color:{color};border-right:1px solid #0a0f1a">'
        f'{label}</div>'
    )

st.markdown(
    f'<div class="threat-bar">{segs_html}</div>',
    unsafe_allow_html=True,
)

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown('<div class="section-hdr">▸ GRID OVERVIEW</div>', unsafe_allow_html=True)

    st.markdown(
        f'<div class="metric-block">'
        f'<div class="metric-label">Total MW Monitored</div>'
        f'<div class="metric-value">{total_mw:.1f}'
        f'<span class="metric-unit">MW</span></div>'
        f'</div>',
        unsafe_allow_html=True,
    )

    alert_cls = "alert" if anomalous else ""
    val_cls = "alert" if anomalous else ""
    st.markdown(
        f'<div class="metric-block {alert_cls}">'
        f'<div class="metric-label">Active Anomalies</div>'
        f'<div class="metric-value {val_cls}">{len(anomalous)}</div>'
        f'</div>',
        unsafe_allow_html=True,
    )

    st.markdown(
        f'<div class="metric-block">'
        f'<div class="metric-label">National Carbon Index</div>'
        f'<div class="metric-value cyan">{national_index:.4f}'
        f'<span class="metric-unit">kg CO₂/cap</span></div>'
        f'</div>',
        unsafe_allow_html=True,
    )

    st.markdown('<div class="section-hdr">▸ SELECT TARGET</div>', unsafe_allow_html=True)
    for gov in gov_data:
        icon = SOURCE_ICON.get(gov["source"], "⚡")
        tag = f" [{gov.get('risk_level', 'NOMINAL')} {gov.get('risk_score', 0):.0f}]" if gov["anomaly"] else ""
        if st.button(f"> {icon} {gov['name']}{tag}", key=f"btn_{gov['name']}", use_container_width=True):
            st.session_state.selected_gov = gov["name"]

    if anomalous:
        st.markdown(
            '<div class="section-hdr alert">▸ DISPATCH</div>',
            unsafe_allow_html=True,
        )
        if st.button("🚁 SIMULATE DRONE DISPATCH", use_container_width=True):
            for g in anomalous:
                if g["name"] not in st.session_state.drone_dispatched:
                    st.session_state.drone_dispatched.add(g["name"])
                    _log(f"DRONE DISPATCHED — {g['name']}", "ok")
                    st.session_state.dispatch_logged.add(g["name"])
            st.success("Drone dispatch simulated!")

    # Mission log
    st.markdown('<div class="section-hdr">▸ MISSION LOG</div>', unsafe_allow_html=True)
    log_entries = st.session_state.mission_log[-10:][::-1]
    lines_html = ""
    for ts, msg, kind in log_entries:
        css = "warn" if kind == "warn" else ("ok" if kind == "ok" else "")
        lines_html += (
            f'<div class="log-line {css}">'
            f'<span class="log-ts">[{ts}]</span>{msg}'
            f'</div>'
        )
    empty_log = '<div class="log-line">— NO ENTRIES —</div>'
    st.markdown(
        f'<div class="log-panel">{lines_html or empty_log}</div>',
        unsafe_allow_html=True,
    )

    import json
    export_data = json.dumps({"national_index": national_index, "regions": gov_data}, indent=2)
    st.markdown('<div class="section-hdr">▸ OPEN DATA PORTAL</div>', unsafe_allow_html=True)
    st.download_button(
        "💽 EXPORT LIVE DATA",
        data=export_data.encode('utf-8'),
        file_name="noorgrid_export.json",
        mime="application/json",
        use_container_width=True
    )

    st.markdown(
        '<div style="margin-top:16px;font-size:0.6em;color:#1e2a38;letter-spacing:0.1em">'
        'DATA: OPEN-METEO / STEG</div>',
        unsafe_allow_html=True,
    )

# ── Tactical map ──────────────────────────────────────────────────────────────
st.markdown(
    '<div class="section-hdr">▸ TACTICAL MAP — TUNISIA ENERGY GRID</div>',
    unsafe_allow_html=True,
)

try:
    import pydeck as pdk

    normal_data  = [g for g in gov_data if not g["anomaly"]]
    anomaly_data = [g for g in gov_data if g["anomaly"]]

    layers = []

    # Outer glow halo for anomaly markers
    if anomaly_data:
        layers.append(pdk.Layer(
            "ScatterplotLayer",
            data=anomaly_data,
            get_position=["lon", "lat"],
            get_color=[255, 51, 51, 30],
            get_radius=58000,
            pickable=False,
            stroked=False,
            filled=True,
        ))

    # Normal markers — green
    if normal_data:
        layers.append(pdk.Layer(
            "ScatterplotLayer",
            data=normal_data,
            get_position=["lon", "lat"],
            get_color=[0, 255, 136, 200],
            get_radius=18000,
            pickable=True,
            stroked=True,
            line_width_min_pixels=2,
            filled=True,
        ))

    # Anomaly markers — red glowing 3D Columns
    if anomaly_data:
        for g in anomaly_data:
            gap = max(10, g["baseline_mw"] - g["output_mw"])
            g["column_height"] = gap * 1500  # Scale for dramatic visual height

        layers.append(pdk.Layer(
            "ColumnLayer",
            data=anomaly_data,
            get_position=["lon", "lat"],
            get_elevation="column_height",
            elevation_scale=1,
            radius=18000,
            get_fill_color=[255, 51, 51, 200],
            get_line_color=[255, 0, 0, 255],
            pickable=True,
            auto_highlight=True,
            extruded=True,
        ))

    # Drone arc layers — flight path from Tunisia centre to dispatched targets
    _TUNISIA_CENTER_LON, _TUNISIA_CENTER_LAT = 9.5, 34.5
    arc_data = [
        {
            "src_lon": _TUNISIA_CENTER_LON,
            "src_lat": _TUNISIA_CENTER_LAT,
            "tgt_lon": g["lon"],
            "tgt_lat": g["lat"],
            "name": g["name"],
        }
        for g in anomaly_data
        if g["name"] in st.session_state.drone_dispatched
    ]
    if arc_data:
        layers.append(pdk.Layer(
            "ArcLayer",
            data=arc_data,
            get_source_position=["src_lon", "src_lat"],
            get_target_position=["tgt_lon", "tgt_lat"],
            get_source_color=[255, 136, 0, 180],
            get_target_color=[255, 51, 51, 220],
            get_width=4,
            pickable=True,
            auto_highlight=True,
        ))

    # Labels
    layers.append(pdk.Layer(
        "TextLayer",
        data=gov_data,
        get_position=["lon", "lat"],
        get_text="name",
        get_size=13,
        get_color=[180, 190, 200, 255],
        get_pixel_offset=[0, -32],
        get_alignment_baseline="'bottom'",
    ))

    view_state = pdk.ViewState(
        latitude=34.5,
        longitude=9.5,
        zoom=5.1,
        pitch=55,
        bearing=15,
    )

    tooltip = {
        "html": (
            "<span style='font-family:JetBrains Mono,monospace;font-size:11px'>"
            "<b style='color:#00ff88'>{name}</b><br/>"
            "Source: {source}<br/>"
            "<span style='color:#06b6d4'>Output: {output_mw} MW</span>"
            "</span>"
        ),
        "style": {
            "backgroundColor": "#040810",
            "border": "1px solid #00ff8835",
            "color": "#c9d1d9",
            "padding": "8px 12px",
            "borderRadius": "4px",
        },
    }

    map_placeholder = st.empty()
    
    if st.session_state.animating_drones:
        import time
        _TUNISIA_CENTER_LON, _TUNISIA_CENTER_LAT = 9.5, 34.5
        target_govs = [g for g in anomaly_data if g["name"] in st.session_state.animating_drones]
        
        for frame in range(40):
            progress = frame / 19.5 # 0.0 to 2.0
            drone_pts = []
            for i, g in enumerate(target_govs):
                if progress <= 1.0:
                    lon = _TUNISIA_CENTER_LON + (g["lon"] - _TUNISIA_CENTER_LON) * progress
                    lat = _TUNISIA_CENTER_LAT + (g["lat"] - _TUNISIA_CENTER_LAT) * progress
                else:
                    p2 = progress - 1.0
                    lon = g["lon"] + (_TUNISIA_CENTER_LON - g["lon"]) * p2
                    lat = g["lat"] + (_TUNISIA_CENTER_LAT - g["lat"]) * p2
                drone_pts.append({"lon": lon, "lat": lat, "name": f"Drone {list(st.session_state.animating_drones).index(g['name']) + 1}"})
                
            anim_layers = list(layers)
            anim_layers.append(pdk.Layer(
                "ScatterplotLayer",
                data=drone_pts,
                get_position=["lon", "lat"],
                get_fill_color=[0, 255, 255, 255],
                get_radius=30000,
                pickable=False,
                filled=True,
            ))
            anim_layers.append(pdk.Layer(
                "TextLayer",
                data=drone_pts,
                get_position=["lon", "lat"],
                get_text="name",
                get_size=18,
                get_color=[0, 255, 255, 255],
                get_pixel_offset=[0, -25],
                get_alignment_baseline="'bottom'",
            ))
            
            map_placeholder.pydeck_chart(
                pdk.Deck(
                    layers=anim_layers,
                    initial_view_state=view_state,
                    map_style="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
                ),
                use_container_width=True,
            )
            time.sleep(0.05)
            
        st.session_state.drones_to_report = list(st.session_state.animating_drones)
        for t in st.session_state.animating_drones:
            st.session_state.drone_dispatched.add(t)
            st.session_state.dispatch_logged.add(t)
        st.session_state.animating_drones.clear()
        st.rerun()
    else:
        map_placeholder.pydeck_chart(
            pdk.Deck(
                layers=layers,
                initial_view_state=view_state,
                map_style="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
                tooltip=tooltip,
            ),
            use_container_width=True,
        )
except ImportError:
    map_df = pd.DataFrame([{"lat": g["lat"], "lon": g["lon"]} for g in gov_data])
    st.map(map_df, zoom=5)

# ── Governorate status cards ──────────────────────────────────────────────────
st.markdown(
    '<div class="section-hdr">▸ GOVERNORATE STATUS</div>',
    unsafe_allow_html=True,
)

# Night mode indicator
_tunis_hour = (datetime.now(timezone.utc) + timedelta(hours=1)).hour
_is_night = _tunis_hour < 6 or _tunis_hour >= 20
if _is_night:
    st.markdown(
        f'<div style="background:#0a0800;border:1px solid #d2992220;border-radius:4px;'
        f'padding:8px 14px;margin-bottom:12px;font-size:0.72em;color:#d29922;'
        f'letter-spacing:0.05em;mono-text">'
        f'🌙 NIGHT MODE — {_tunis_hour:02d}:00 TUN &nbsp;|&nbsp; '
        f'Solar output: 0 MW (expected) &nbsp;|&nbsp; '
        f'Wind anomalies suppressed after 22:00 &nbsp;|&nbsp; '
        f'Hydro operates 24/7'
        f'</div>',
        unsafe_allow_html=True,
    )

cols = st.columns(len(gov_data))
for col, g in zip(cols, gov_data):
    with col:
        anomaly_cls = "anomaly" if g["anomaly"] else ""
        title_cls   = "anomaly" if g["anomaly"] else ""
        src_low     = g["source"].lower()

        html = (
            f'<div class="gov-card {anomaly_cls}">'
            f'<div class="gov-title {title_cls}">'
            f'{SOURCE_ICON.get(g["source"], "⚡")} {g["name"]}'
            f'<span class="src-badge badge-{src_low}">{g["source"]}</span>'
            f'</div>'
            f'<div class="gov-row">Output &nbsp;&nbsp;&nbsp;<span>{g["output_mw"]:.2f} MW</span></div>'
            f'<div class="gov-row">Baseline <span>{g["baseline_mw"]:.0f} MW</span></div>'
            f'<div class="gov-row">Risk &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span>{g.get("risk_level","NOMINAL")} ({g.get("risk_score",0):.1f})</span></div>'
            f'<div class="gov-row">Carbon &nbsp;&nbsp;<span>{g["carbon_score_kg"]:,.0f} kg CO₂</span></div>'
        )

        if g["source"] == "Wind" and g.get("wind_speed_ms") is not None:
            html += f'<div class="gov-row">Wind &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span>{g["wind_speed_ms"]:.2f} m/s</span></div>'

        if g["name"] == "Béja" and hydro_forecast and hydro_forecast.get("predictions"):
            _beja_preds = hydro_forecast["predictions"]
            _avg_12m = sum(float(p.get("predicted_mw", 0.0)) for p in _beja_preds) / max(len(_beja_preds), 1)
            _next_drought = next(
                (p.get("month", "") for p in _beja_preds if p.get("risk") == "DROUGHT_RISK"),
                "None detected",
            )
            html += (
                f'<div class="gov-row" style="margin-top:8px;padding-top:6px;'
                f'border-top:1px solid #0a0f1a;color:#8b949e">'
                f'📈 12-month avg forecast: <span>{_avg_12m:.2f} MW</span>'
                f' &nbsp;|&nbsp; Next drought risk: <span>{_next_drought}</span>'
                f'</div>'
            )

        if g["anomaly"]:
            if g["name"] in st.session_state.drone_dispatched:
                html += '<div class="drone-alert">🚁 DRONE DISPATCH INITIATED</div>'
            else:
                html += '<div class="drone-alert static">⚠ ANOMALY DETECTED</div>'
            if g["source"] == "Wind" and g.get("wind_speed_ms") is not None:
                ctx = wind_context_label(g["wind_speed_ms"])
                html += f'<div class="wind-ctx">🌬 {ctx}</div>'

        html += "</div>"
        st.markdown(html, unsafe_allow_html=True)

        if g["anomaly"]:
            if st.button(
                f"🚁 DISPATCH → {g['name']}",
                key=f"drone_{g['name']}",
                use_container_width=True,
            ):
                if g["name"] not in st.session_state.drone_dispatched and g["name"] not in st.session_state.animating_drones:
                    st.session_state.animating_drones.add(g["name"])
                    st.rerun()

# ── Selected governorate detail ───────────────────────────────────────────────
sel = gov_lookup.get(st.session_state.selected_gov)
if sel:
    st.markdown(
        f'<div class="section-hdr">▸ TARGET: {sel["name"].upper()} — {sel["source"].upper()}</div>',
        unsafe_allow_html=True,
    )
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Energy Source", sel["source"])
    c2.metric(
        "Output (MW)",
        f"{sel['output_mw']:.2f}",
        delta=f"{sel['output_mw'] - sel['baseline_mw']:.2f} vs baseline",
    )
    c3.metric("Carbon Score", f"{sel['carbon_score_kg']:,.0f} kg CO₂")
    c4.metric("Risk", f"{sel.get('risk_level', 'NOMINAL')} ({sel.get('risk_score', 0):.1f})")

    _rc = sel.get("risk_components", {})
    st.markdown(
        f'<div style="margin-top:8px;font-size:0.72em;color:#8b949e;letter-spacing:0.06em">'
        f'RISK COMPONENTS — DEV {_rc.get("deviation", 0):.1f} · '
        f'ROC {_rc.get("rate_of_change", 0):.1f} · '
        f'REGIONAL {_rc.get("regional_correlation", 0):.1f}'
        f'</div>',
        unsafe_allow_html=True,
    )

    if sel["source"] == "Wind" and sel.get("wind_speed_ms") is not None:
        ctx = wind_context_label(sel["wind_speed_ms"])
        st.markdown(
            f'<div class="wind-ctx" style="margin-top:10px">🌬 {ctx}</div>',
            unsafe_allow_html=True,
        )

# ── Historical trend (selected governorate) ────────────────────────────────────
if sel:
    st.markdown(
        f'<div class="section-hdr">▸ 48H TREND — {sel["name"].upper()}</div>',
        unsafe_allow_html=True,
    )
    try:
        _hist_resp = httpx.get(
            f"{BACKEND_URL}/history/{st.session_state.selected_gov}",
            params={"days": 3},
            timeout=15,
        )
        _hist_resp.raise_for_status()
        _hist_records = _hist_resp.json().get("records", [])

        if _hist_records:
            _hist_df = pd.DataFrame(_hist_records)
            if "recorded_at" in _hist_df.columns:
                _hist_df["recorded_at"] = pd.to_datetime(_hist_df["recorded_at"], errors="coerce")
                _hist_df = _hist_df.dropna(subset=["recorded_at"]).sort_values("recorded_at")

            _is_wind = sel["source"] == "Wind"
            _trend_col = "wind_speed_ms" if _is_wind else "solar_irradiance_wm2"
            _trend_label = "WIND SPEED (m/s)" if _is_wind else "SOLAR IRRADIANCE (W/m²)"
            _trend_color = "#00c8ff" if _is_wind else "#ffd166"

            if _trend_col in _hist_df.columns and not _hist_df.empty:
                _tfig = go.Figure()
                _tfig.add_trace(
                    go.Scatter(
                        x=_hist_df["recorded_at"],
                        y=_hist_df[_trend_col],
                        mode="lines+markers",
                        line={"color": _trend_color, "width": 2},
                        marker={"size": 6, "color": _trend_color, "line": {"width": 1, "color": "#020408"}},
                        hovertemplate="<b>%{x}</b><br>%{y:.2f}<extra></extra>",
                        showlegend=False,
                    )
                )
                _tfig.update_layout(
                    xaxis_title="TIME (TUN)",
                    yaxis_title=_trend_label,
                    paper_bgcolor="#020408",
                    plot_bgcolor="#040810",
                    font={"family": "JetBrains Mono, Courier New, monospace", "color": "#3d4a5a", "size": 11},
                    xaxis={"gridcolor": "#0a0f1a", "linecolor": "#0a0f1a", "tickfont": {"color": "#5a6a7a"}},
                    yaxis={"gridcolor": "#0a0f1a", "linecolor": "#0a0f1a", "tickfont": {"color": "#5a6a7a"}},
                    margin={"t": 10, "b": 40, "l": 60, "r": 20},
                    height=280,
                )
                st.plotly_chart(_tfig, use_container_width=True)
            else:
                st.info("COLLECTING DATA — check back after first weather fetch cycle.")
        else:
            st.info("COLLECTING DATA — check back after first weather fetch cycle.")
    except Exception:
        st.warning("TREND UNAVAILABLE — unable to connect to historical data service.")

# ── Sidi Salem SARIMAX Forecast ────────────────────────────────────────────────
st.markdown(
    '<div class="section-hdr">▸ SIDI SALEM DAM — SARIMAX 12-MONTH PRODUCTION FORECAST</div>',
    unsafe_allow_html=True,
)

if hydro_forecast and hydro_forecast.get("predictions"):
    _hf_preds = hydro_forecast["predictions"]
    _hf_rmse = float(hydro_forecast.get("model_rmse", 0.0))
    _hf_points = int(hydro_forecast.get("data_points_used", 0))
    _hf_conf = str(hydro_forecast.get("confidence", "LOW")).upper()
    _hf_drought = bool(hydro_forecast.get("drought_warning", False))
    _hf_conf_color = {"HIGH": "#00ff88", "MEDIUM": "#ffb020", "LOW": "#ff3333"}.get(_hf_conf, "#ff3333")
    _hf_drought_color = "#ff3333" if _hf_drought else "#00ff88"
    _hf_drought_cls = "blink" if _hf_drought else ""

    _hm1, _hm2, _hm3, _hm4 = st.columns(4)
    with _hm1:
        st.markdown(
            f'<div style="background:#0a0f1a;border:1px solid #06b6d438;border-radius:4px;'
            f'padding:10px 12px">'
            f'<div style="font-size:0.62em;color:#3d4a5a;letter-spacing:0.1em">MODEL RMSE</div>'
            f'<div style="font-size:1.25em;color:#06b6d4;font-weight:700">{_hf_rmse:.3f}</div>'
            f'</div>',
            unsafe_allow_html=True,
        )
    with _hm2:
        st.markdown(
            f'<div style="background:#0a0f1a;border:1px solid #5a6a7a38;border-radius:4px;'
            f'padding:10px 12px">'
            f'<div style="font-size:0.62em;color:#3d4a5a;letter-spacing:0.1em">DATA POINTS USED</div>'
            f'<div style="font-size:1.25em;color:#8b949e;font-weight:700">{_hf_points}</div>'
            f'</div>',
            unsafe_allow_html=True,
        )
    with _hm3:
        st.markdown(
            f'<div style="background:#0a0f1a;border:1px solid {_hf_conf_color}55;border-radius:4px;'
            f'padding:10px 12px">'
            f'<div style="font-size:0.62em;color:#3d4a5a;letter-spacing:0.1em">CONFIDENCE LEVEL</div>'
            f'<div style="font-size:1.25em;color:{_hf_conf_color};font-weight:700">{_hf_conf}</div>'
            f'</div>',
            unsafe_allow_html=True,
        )
    with _hm4:
        st.markdown(
            f'<div style="background:#0a0f1a;border:1px solid {_hf_drought_color}55;border-radius:4px;'
            f'padding:10px 12px">'
            f'<div style="font-size:0.62em;color:#3d4a5a;letter-spacing:0.1em">DROUGHT WARNING</div>'
            f'<div class="{_hf_drought_cls}" style="font-size:1.25em;color:{_hf_drought_color};font-weight:700">'
            f'{"TRUE" if _hf_drought else "FALSE"}'
            f'</div></div>',
            unsafe_allow_html=True,
        )

    if _hf_drought:
        st.markdown(
            '<div style="margin-top:8px;background:#1a0000;border:1px solid #ff3333;'
            'border-radius:4px;padding:12px 14px;color:#ff7b72;font-size:0.8em;letter-spacing:0.04em">'
            '⚠ DROUGHT RISK DETECTED — Sidi Salem Dam forecast shows sustained low production.<br/>'
            'Activate gas backup capacity. Alert SONEDE water authority.'
            '</div>',
            unsafe_allow_html=True,
        )

    _hf_months = [p["month"] for p in _hf_preds]
    _hf_y = [float(p.get("predicted_mw", 0.0)) for p in _hf_preds]
    _hf_low = [float(p.get("confidence_lower", 0.0)) for p in _hf_preds]
    _hf_high = [float(p.get("confidence_upper", 0.0)) for p in _hf_preds]
    _hf_risk = [p.get("risk", "NORMAL") for p in _hf_preds]

    _hfig = go.Figure()
    _hfig.add_trace(
        go.Scatter(
            x=_hf_months,
            y=_hf_high,
            mode="lines",
            line={"color": "rgba(6,182,212,0)"},
            hoverinfo="skip",
            showlegend=False,
        )
    )
    _hfig.add_trace(
        go.Scatter(
            x=_hf_months,
            y=_hf_low,
            mode="lines",
            line={"color": "rgba(6,182,212,0)"},
            fill="tonexty",
            fillcolor="rgba(6,182,212,0.15)",
            hoverinfo="skip",
            showlegend=False,
        )
    )

    _seg_start = 0
    while _seg_start < len(_hf_months):
        _seg_risk = _hf_risk[_seg_start]
        _seg_end = _seg_start + 1
        while _seg_end < len(_hf_months) and _hf_risk[_seg_end] == _seg_risk:
            _seg_end += 1
        _seg_color = "#ff3333" if _seg_risk == "DROUGHT_RISK" else "#06b6d4"
        _hfig.add_trace(
            go.Scatter(
                x=_hf_months[_seg_start:_seg_end],
                y=_hf_y[_seg_start:_seg_end],
                mode="lines+markers",
                line={"color": _seg_color, "width": 2},
                marker={"size": 5, "color": _seg_color},
                showlegend=False,
                hovertemplate="<b>%{x}</b><br>Predicted: %{y:.2f} MW<extra></extra>",
            )
        )
        _seg_start = _seg_end

    _hfig.add_hline(y=16.5, line_dash="dash", line_color="#ff3333", line_width=1)
    _hfig.add_hline(y=33.0, line_dash="dash", line_color="#00ff88", line_width=1)
    _hfig.update_layout(
        title={
            "text": "SIDI SALEM DAM — SARIMAX FORECAST (BÉJA)",
            "font": {"color": "#00ff88", "size": 12, "family": "JetBrains Mono, Courier New, monospace"},
        },
        xaxis_title="MONTH",
        yaxis_title="MW",
        paper_bgcolor="#020408",
        plot_bgcolor="#040810",
        font={"family": "JetBrains Mono, Courier New, monospace", "color": "#5a6a7a", "size": 10},
        xaxis={"gridcolor": "#0a0f1a", "linecolor": "#0a0f1a"},
        yaxis={"gridcolor": "#0a0f1a", "linecolor": "#0a0f1a", "range": [0, 35]},
        margin={"t": 36, "b": 28, "l": 56, "r": 12},
        height=220,
    )
    st.plotly_chart(_hfig, use_container_width=True)

    _table_html = (
        '<div style="overflow-x:auto;margin-top:4px">'
        '<table style="width:100%;border-collapse:collapse;font-size:0.72em;'
        'font-family:JetBrains Mono,monospace">'
        '<thead><tr style="color:#3d4a5a;border-bottom:1px solid #0a0f1a">'
        '<th style="text-align:left;padding:6px 8px">MONTH</th>'
        '<th style="text-align:right;padding:6px 8px">PREDICTED MW</th>'
        '<th style="text-align:center;padding:6px 8px">RISK</th>'
        '<th style="text-align:center;padding:6px 8px">SEASON</th>'
        '</tr></thead><tbody>'
    )
    for _p in _hf_preds:
        _is_drought = _p.get("risk") == "DROUGHT_RISK"
        _row_bg = "#1a0000" if _is_drought else "#0a0f1a"
        _row_color = "#ff3333" if _is_drought else "#8b949e"
        _table_html += (
            f'<tr style="background:{_row_bg};border-bottom:1px solid #0a0f1a">'
            f'<td style="padding:6px 8px;color:#5a6a7a">{_p.get("month","")}</td>'
            f'<td style="padding:6px 8px;text-align:right;color:#06b6d4">{float(_p.get("predicted_mw",0.0)):.2f}</td>'
            f'<td style="padding:6px 8px;text-align:center;color:{_row_color};font-weight:700">{_p.get("risk","NORMAL")}</td>'
            f'<td style="padding:6px 8px;text-align:center;color:#5a6a7a">{_p.get("season","")}</td>'
            f'</tr>'
        )
    _table_html += "</tbody></table></div>"
    st.markdown(_table_html, unsafe_allow_html=True)
else:
    st.warning("SARIMAX MODEL UNAVAILABLE — install statsmodels and ensure backend is running")

# ── Blackout Prediction Engine ────────────────────────────────────────────────
st.markdown(
    '<div class="section-hdr">▸ BLACKOUT PREDICTION ENGINE — 72H FORECAST</div>',
    unsafe_allow_html=True,
)

_pred_region = st.selectbox(
    "> SELECT REGION FOR ANALYSIS",
    options=[g["name"] for g in GOVERNORATES],
    key="blackout_region",
    label_visibility="collapsed",
)

_RISK_COLOR = {"CRITICAL": "#ff3333", "HIGH": "#ff8800", "ELEVATED": "#d4e000", "NOMINAL": "#00ff88"}
_RISK_BG    = {"CRITICAL": "#1a0000", "HIGH": "#1a0800", "ELEVATED": "#161600", "NOMINAL": "#001a0d"}

try:
    _pred_resp = httpx.post(
        f"{BACKEND_URL}/predict/blackout",
        json={"region": _pred_region, "forecast_hours": 24},
        timeout=20,
    )
    _pred_resp.raise_for_status()
    _preds_raw = _pred_resp.json()["predictions"]

    # ── Simulation mode — test summer peak conditions ─────────────────────────
    _sim_col1, _sim_col2 = st.columns([2, 1])
    with _sim_col1:
        _sim_temp = st.slider(
            "SIMULATE TEMPERATURE (°C) — drag to test summer heatwave scenarios",
            min_value=15, max_value=48, value=25, step=1,
            key="sim_temp",
            help="Real Tunisia summer peaks reach 45-48°C. Aug 14 2024 record: 4,888 MW demand."
        )
    with _sim_col2:
        st.markdown(
            '<div style="background:#040810;border:1px solid #00ff8820;border-radius:4px;'
            'padding:12px;margin-top:20px;font-size:0.72em;color:#3d4a5a">'
            '<span style="color:#00ff88">STEG RECORD</span><br/>'
            '4,888 MW — Aug 14 2024<br/>'
            '<span style="color:#3d4a5a">Effective capacity: 4,636 MW</span>'
            '</div>',
            unsafe_allow_html=True,
        )

    # ── Recalculate using TOTAL grid capacity — not just renewables ────────────
    # Real blackout risk = TOTAL DEMAND vs TOTAL EFFECTIVE GRID CAPACITY (4,636 MW)
    # April temps (~20°C) → NOMINAL. Summer heatwave (45°C) → CRITICAL.
    # Use slider temperature to override forecast for simulation.
    def recalculate_blackout(p: dict) -> dict:
        # Use simulated temp if slider > 25, otherwise use real forecast temp
        real_temp = float(p.get("temperature", 20.0))
        temp = float(_sim_temp) if _sim_temp > 25 else real_temp
        hour = int(str(p.get("time_label", "12:00"))[:2])

        # Peak hours 14:00-18:00 drive additional 5% demand
        peak_hour_factor = 1.05 if 14 <= hour <= 18 else 1.0
        # Each degree above 25°C adds 4% to demand (AC surge)
        cooling_surge = max(0.0, (temp - 25.0) * 0.04)
        # Additional industrial load factor in summer
        industrial_factor = 1.0 + (0.02 if temp > 35 else 0.0)
        estimated_demand = (
            STEG_BASELINE_DEMAND_MW
            * (1 + cooling_surge)
            * peak_hour_factor
            * industrial_factor
        )

        # Renewable contribution from backend (marginal but real)
        renewable_mw = float(p.get("available_mw", 0.0))

        # Total effective = full STEG capacity after 22% losses + renewables
        # Note: renewables are already IN the 5,944 MW total — don't double count
        # Use STEG_EFFECTIVE_CAPACITY_MW as the ceiling
        total_available = STEG_EFFECTIVE_CAPACITY_MW  # 4,636 MW

        # Headroom — positive = safe, negative = blackout territory
        headroom_pct = ((total_available - estimated_demand) / total_available) * 100
        stress_ratio = estimated_demand / max(total_available, 1)

        # Risk tiers — calibrated to Aug 14 2024 event
        # At that day: ~4,888 MW demand vs 4,636 MW effective = -5.4% headroom
        if headroom_pct < 0:
            prob, risk = 95.0, "CRITICAL"
        elif headroom_pct < 5:
            prob, risk = 75.0, "CRITICAL"
        elif headroom_pct < 10:
            prob, risk = 55.0, "HIGH"
        elif headroom_pct < 20:
            prob, risk = 30.0, "ELEVATED"
        else:
            prob = max(0.0, 20.0 - headroom_pct * 0.4)
            risk = "NOMINAL"

        actions = {
            "CRITICAL": "EMERGENCY LOAD SHEDDING — Activate Transmed imports + demand rationing",
            "HIGH":     f"REDUCE INDUSTRIAL LOAD in {_pred_region} — Spin up reserve turbines",
            "ELEVATED": "MONITOR GRID FREQUENCY — Prepare demand response protocols",
            "NOMINAL":  "NO ACTION REQUIRED — Grid within safe margins",
        }

        return {
            **p,
            "temperature":                temp,
            "estimated_demand_mw":        round(estimated_demand, 1),
            "available_mw":               round(total_available, 1),
            "renewable_contribution_mw":  round(renewable_mw, 1),
            "stress_ratio":               round(stress_ratio, 4),
            "headroom_pct":               round(headroom_pct, 1),
            "blackout_probability":       round(prob, 1),
            "risk_level":                 risk,
            "prevention_action":          actions[risk],
        }

    _preds = [recalculate_blackout(p) for p in _preds_raw]

    _hours     = [p["time_label"]           for p in _preds]
    _probs     = [p["blackout_probability"]  for p in _preds]
    _mcolors   = [
        "#ff3333" if p > 60 else "#ff8800" if p > 30 else "#00ff88"
        for p in _probs
    ]

    # Line chart
    _pfig = go.Figure()
    _pfig.add_hrect(y0=60,  y1=105, fillcolor="rgba(255,51,51,0.04)",   line_width=0)
    _pfig.add_hrect(y0=30,  y1=60,  fillcolor="rgba(255,136,0,0.04)",   line_width=0)
    _pfig.add_hrect(y0=0,   y1=30,  fillcolor="rgba(0,255,136,0.025)",  line_width=0)
    _pfig.add_hline(y=60, line_dash="dot", line_color="rgba(255,51,51,0.25)",  line_width=1)
    _pfig.add_hline(y=30, line_dash="dot", line_color="rgba(255,136,0,0.25)",  line_width=1)
    _pfig.add_trace(go.Scatter(
        x=_hours, y=_probs,
        mode="lines",
        line={"color": "#1e2a38", "width": 2},
        showlegend=False,
        hoverinfo="skip",
    ))
    _pfig.add_trace(go.Scatter(
        x=_hours, y=_probs,
        mode="markers",
        marker={"color": _mcolors, "size": 9, "line": {"width": 1, "color": "#020408"}},
        hovertemplate="<b>%{x}</b><br>Probability: %{y:.1f}%<extra></extra>",
        showlegend=False,
    ))
    _pfig.update_layout(
        title={
            "text": f"GRID STRESS FORECAST — {_pred_region.upper()}",
            "font": {"color": "#00ff88", "size": 13,
                     "family": "JetBrains Mono, Courier New, monospace"},
        },
        xaxis_title="TIME (TUN)",
        yaxis_title="BLACKOUT PROBABILITY (%)",
        xaxis={"gridcolor": "#0a0f1a", "linecolor": "#0a0f1a",
               "tickfont": {"color": "#3d4a5a", "size": 10}},
        yaxis={"range": [0, 105], "gridcolor": "#0a0f1a", "linecolor": "#0a0f1a",
               "tickfont": {"color": "#3d4a5a", "size": 10}},
        paper_bgcolor="#020408",
        plot_bgcolor="#040810",
        font={"family": "JetBrains Mono, Courier New, monospace",
              "color": "#3d4a5a", "size": 11},
        margin={"t": 40, "b": 40, "l": 60, "r": 20},
        height=280,
    )
    st.plotly_chart(_pfig, use_container_width=True)

    # Peak risk window alert
    _peak    = max(_preds, key=lambda p: p["blackout_probability"])
    _pk_risk  = _peak["risk_level"]
    _pk_color = _RISK_COLOR[_pk_risk]
    _pk_bg    = _RISK_BG[_pk_risk]
    _pk_glow  = f"0 0 18px {_pk_color}40" if _pk_risk in ("CRITICAL", "HIGH") else "none"
    _pk_h_start = _peak["time_label"]
    _pk_h_end   = f"{(int(_peak['time_label'][:2]) + 1) % 24:02d}:00"

    st.markdown(
        f'<div style="background:{_pk_bg};border:1px solid {_pk_color};border-radius:5px;'
        f'padding:16px 20px;margin:12px 0;box-shadow:{_pk_glow}">'
        f'<div style="font-size:0.68em;color:{_pk_color};letter-spacing:0.18em;'
        f'font-weight:700;margin-bottom:10px">⚠ PEAK RISK WINDOW</div>'
        f'<div style="font-size:0.82em;color:#c9d1d9;line-height:1.9">'
        f'{_pk_h_start} — {_pk_h_end} TUN<br/>'
        f'Temperature: <span style="color:#06b6d4">{_peak["temperature"]}°C</span><br/>'
        f'Demand: <span style="color:#06b6d4">{_peak["estimated_demand_mw"]:.0f} MW</span>'
        f' &nbsp;|&nbsp; '
        f'Total Available: <span style="color:#06b6d4">{_peak["available_mw"]:.0f} MW</span>'
        f' &nbsp;|&nbsp; '
        f'Renewables: <span style="color:#00ff88">{_peak["renewable_contribution_mw"]:.1f} MW</span><br/>'
        f'Grid Headroom: <span style="color:{_pk_color};font-weight:700">{_peak["headroom_pct"]:.1f}%</span>'
        f' &nbsp;|&nbsp; '
        f'Blackout Probability: <span style="color:{_pk_color};font-weight:700">'
        f'{_peak["blackout_probability"]:.1f}%</span><br/>'
        f'Prevention: <span style="color:{_pk_color}">{_peak["prevention_action"]}</span>'
        f'</div></div>',
        unsafe_allow_html=True,
    )

    # 24-row hourly table
    st.markdown(
        '<div style="font-size:0.62em;color:#3d4a5a;letter-spacing:0.14em;'
        'margin:14px 0 6px">HOURLY BREAKDOWN</div>',
        unsafe_allow_html=True,
    )
    _rows_html = (
        '<div style="overflow-x:auto">'
        '<table style="width:100%;border-collapse:collapse;font-size:0.72em;'
        'font-family:JetBrains Mono,monospace">'
        '<thead><tr style="color:#3d4a5a;border-bottom:1px solid #0a0f1a">'
        '<th style="text-align:left;padding:5px 8px">TIME</th>'
        '<th style="text-align:right;padding:5px 8px">TEMP °C</th>'
        '<th style="text-align:right;padding:5px 8px">DEMAND MW</th>'
        '<th style="text-align:right;padding:5px 8px">AVAIL MW</th>'
        '<th style="text-align:right;padding:5px 8px">STRESS</th>'
        '<th style="text-align:center;padding:5px 8px">RISK</th>'
        '<th style="text-align:right;padding:5px 8px">PROB %</th>'
        '</tr></thead><tbody>'
    )
    for _p in _preds:
        _rc  = _RISK_COLOR[_p["risk_level"]]
        _rbg = _RISK_BG[_p["risk_level"]]
        _rows_html += (
            f'<tr style="border-bottom:1px solid #080d14">'
            f'<td style="padding:5px 8px;color:#5a6a7a">{_p["time_label"]}</td>'
            f'<td style="padding:5px 8px;text-align:right;color:#06b6d4">{_p["temperature"]:.1f}</td>'
            f'<td style="padding:5px 8px;text-align:right;color:#06b6d4">{_p["estimated_demand_mw"]:.2f}</td>'
            f'<td style="padding:5px 8px;text-align:right;color:#06b6d4">{_p["available_mw"]:.2f}</td>'
            f'<td style="padding:5px 8px;text-align:right;color:#5a6a7a">{_p["stress_ratio"]:.3f}</td>'
            f'<td style="padding:5px 8px;text-align:center;background:{_rbg};'
            f'color:{_rc};font-weight:700;letter-spacing:0.08em">{_p["risk_level"]}</td>'
            f'<td style="padding:5px 8px;text-align:right;color:{_rc};font-weight:700">'
            f'{_p["blackout_probability"]:.1f}</td>'
            f'</tr>'
        )
    _rows_html += '</tbody></table></div>'
    st.markdown(_rows_html, unsafe_allow_html=True)

except Exception as _pred_err:
    st.markdown(
        f'<div style="background:#0a0f1a;border:1px solid #ff333340;border-radius:4px;'
        f'padding:14px 18px;color:#ff333388;font-size:0.8em">'
        f'⚠ PREDICTION ENGINE OFFLINE — {_pred_err}</div>',
        unsafe_allow_html=True,
    )

# ── National Grid Simulation Console ───────────────────────────────────────────
st.markdown(
    '<div class="section-hdr">▸ NATIONAL GRID SIMULATION CONSOLE</div>',
    unsafe_allow_html=True,
)
_sim_c1, _sim_c2, _sim_c3, _sim_c4 = st.columns([1.2, 1.2, 1.2, 1.0])
with _sim_c1:
    _sim_demand_delta = st.slider("Demand delta %", min_value=-20, max_value=50, value=0, step=1)
with _sim_c2:
    _sim_temp = st.slider("Temperature °C", min_value=15, max_value=50, value=30, step=1)
with _sim_c3:
    _sim_reserve = st.slider("Reserve MW", min_value=0, max_value=1000, value=0, step=25)
with _sim_c4:
    _sim_peak = st.toggle("Peak-hour factor", value=True)

_grid_sim = simulate_national_grid(
    renewable_output_mw=total_mw,
    demand_delta_pct=_sim_demand_delta,
    temperature_c=_sim_temp,
    include_peak_hour_factor=_sim_peak,
    reserve_capacity_mw=_sim_reserve,
)

if _grid_sim:
    _gk1, _gk2, _gk3, _gk4 = st.columns(4)
    _gk1.metric("Demand (MW)", f"{_grid_sim['total_demand_mw']:.1f}")
    _gk2.metric("Capacity (MW)", f"{_grid_sim['effective_capacity_mw']:.1f}")
    _gk3.metric("Import Required (MW)", f"{_grid_sim['import_required_mw']:.1f}")
    _gk4.metric("Import Reliance", f"{_grid_sim['import_reliance_pct']:.1f}%")

    _risk_color = {
        "NOMINAL": "#00ff88",
        "ELEVATED": "#d4e000",
        "HIGH": "#ff8800",
        "CRITICAL": "#ff3333",
    }.get(_grid_sim["risk_level"], "#5a6a7a")
    st.markdown(
        f'<div style="margin-top:6px;background:#040810;border:1px solid {_risk_color}44;border-radius:4px;'
        f'padding:12px 14px;font-size:0.76em;line-height:1.8;color:#8b949e">'
        f'RISK: <span style="color:{_risk_color};font-weight:700">{_grid_sim["risk_level"]}</span>'
        f' &nbsp;|&nbsp; SCORE: <span style="color:{_risk_color};font-weight:700">{_grid_sim["risk_score"]:.1f}</span>'
        f' &nbsp;|&nbsp; HEADROOM: <span style="color:{_risk_color};font-weight:700">{_grid_sim["headroom_pct"]:.1f}%</span><br/>'
        f'RENEWABLE SHARE: <span style="color:#06b6d4">{_grid_sim["renewable_share_pct"]:.1f}%</span>'
        f' &nbsp;|&nbsp; ACTION: <span style="color:{_risk_color}">{_grid_sim["recommended_action"]}</span>'
        f'</div>',
        unsafe_allow_html=True,
    )

    _grid_fig = go.Figure(
        data=[
            go.Bar(
                name="Demand",
                x=["National Grid"],
                y=[_grid_sim["total_demand_mw"]],
                marker_color="#ff3333",
            ),
            go.Bar(
                name="Effective Capacity",
                x=["National Grid"],
                y=[_grid_sim["effective_capacity_mw"]],
                marker_color="#00ff88",
            ),
            go.Bar(
                name="Renewables",
                x=["National Grid"],
                y=[_grid_sim["renewable_output_mw"]],
                marker_color="#06b6d4",
            ),
        ]
    )
    _grid_fig.update_layout(
        barmode="group",
        yaxis_title="MW",
        paper_bgcolor="#020408",
        plot_bgcolor="#040810",
        font={"color": "#5a6a7a", "family": "JetBrains Mono, Courier New, monospace", "size": 11},
        legend={
            "bgcolor": "#040810",
            "bordercolor": "rgba(0,255,136,0.15)",
            "borderwidth": 1,
            "font": {"color": "#8b949e"},
        },
        xaxis={"gridcolor": "#0a0f1a", "linecolor": "#0a0f1a", "tickfont": {"color": "#5a6a7a"}},
        yaxis={"gridcolor": "#0a0f1a", "linecolor": "#0a0f1a", "tickfont": {"color": "#5a6a7a"}},
        margin={"t": 10, "b": 40, "l": 60, "r": 20},
        height=280,
    )
    st.plotly_chart(_grid_fig, use_container_width=True)
else:
    st.warning("GRID SIMULATION OFFLINE — backend /grid/simulate endpoint unavailable.")

# ── Consumption vs Renewable Production chart ─────────────────────────────────
st.markdown(
    '<div class="section-hdr">▸ CONSUMPTION VS RENEWABLE PRODUCTION</div>',
    unsafe_allow_html=True,
)

billing_df = load_billing_data()
avg_consumption = (
    billing_df.groupby("region")["consumption_kwh"].mean().to_dict()
    if not billing_df.empty
    else {}
)

chart_govs      = [g["name"] for g in gov_data]
consumption_vals = [
    avg_consumption.get(g["name"], g["baseline_mw"] * 1000 * BILLING_PERIOD_HOURS)
    for g in gov_data
]
renewable_vals  = [g["output_mw"] * 1000 * BILLING_PERIOD_HOURS for g in gov_data]

fig = go.Figure(data=[
    go.Bar(
        name="Consumption (kWh)",
        x=chart_govs,
        y=consumption_vals,
        marker_color="#ff3333",
        marker_line_color="rgba(255,51,51,0.38)",
        marker_line_width=1,
    ),
    go.Bar(
        name="Renewable Production (kWh)",
        x=chart_govs,
        y=renewable_vals,
        marker_color="#00ff88",
        marker_line_color="rgba(0,255,136,0.38)",
        marker_line_width=1,
    ),
])
fig.update_layout(
    barmode="group",
    xaxis_title="GOVERNORATE",
    yaxis_title="ENERGY (kWh)",
    paper_bgcolor="#020408",
    plot_bgcolor="#040810",
    font={"color": "#5a6a7a", "family": "JetBrains Mono, Courier New, monospace", "size": 11},
    legend={
        "bgcolor": "#040810",
        "bordercolor": "rgba(0,255,136,0.15)",
        "borderwidth": 1,
        "font": {"color": "#8b949e"},
    },
    xaxis={"gridcolor": "#0a0f1a", "linecolor": "#0a0f1a", "tickfont": {"color": "#5a6a7a"}},
    yaxis={"gridcolor": "#0a0f1a", "linecolor": "#0a0f1a", "tickfont": {"color": "#5a6a7a"}},
    margin={"t": 10, "b": 40, "l": 60, "r": 20},
)
st.plotly_chart(fig, use_container_width=True)

# ── National Carbon Index — gauge ────────────────────────────────────────────
st.markdown(
    '<div class="section-hdr">▸ TUNISIA NATIONAL CARBON INDEX</div>',
    unsafe_allow_html=True,
)

gauge_fig = go.Figure(go.Indicator(
    mode="gauge+number",
    value=national_index,
    number={
        "suffix": " kg CO₂/cap",
        "font": {"color": "#06b6d4", "size": 22,
                 "family": "JetBrains Mono, Courier New, monospace"},
        "valueformat": ".4f",
    },
    gauge={
        "axis": {
            "range": [0, 0.5],
            "tickwidth": 1,
            "tickcolor": "#1e2a38",
            "tickfont": {"color": "#3d4a5a", "size": 10},
            "nticks": 6,
        },
        "bar": {"color": "#06b6d4", "thickness": 0.22},
        "bgcolor": "#020408",
        "borderwidth": 1,
        "bordercolor": "#0a0f1a",
        "steps": [
            {"range": [0.00, 0.10], "color": "#001a0d"},
            {"range": [0.10, 0.20], "color": "#161600"},
            {"range": [0.20, 0.35], "color": "#1a0800"},
            {"range": [0.35, 0.50], "color": "#1a0000"},
        ],
        "threshold": {
            "line": {"color": "#06b6d4", "width": 3},
            "thickness": 0.82,
            "value": national_index,
        },
    },
))
gauge_fig.update_layout(
    paper_bgcolor="#020408",
    font={"family": "JetBrains Mono, Courier New, monospace", "color": "#3d4a5a"},
    margin={"t": 30, "b": 10, "l": 40, "r": 40},
    height=260,
    annotations=[{
        "text": (
            f"TOTAL {total_carbon:,.0f} kg CO₂ &nbsp;/&nbsp; "
            f"{len(gov_data)} REGIONS &nbsp;/&nbsp; "
            f"{TUNISIA_POPULATION:,} POPULATION"
        ),
        "x": 0.5, "y": -0.08,
        "xref": "paper", "yref": "paper",
        "showarrow": False,
        "font": {"size": 10, "color": "#1e2a38",
                 "family": "JetBrains Mono, Courier New, monospace"},
    }],
)
st.plotly_chart(gauge_fig, use_container_width=True)
# ── AI Investment Advisor — Powered by NVIDIA NIM ────────────────────────────
st.markdown(
    '<div class="section-hdr">▸ AI INVESTMENT ADVISOR — SHORT & LONG TERM STRATEGY</div>',
    unsafe_allow_html=True,
)
st.markdown(
    '<div style="font-size:0.72em;color:#3d4a5a;margin-bottom:12px;letter-spacing:0.05em">'
    'AI-generated investment recommendations based on real-time grid data. '
    'Powered by NVIDIA NIM — Llama 3.1 70B Instruct.'
    '</div>',
    unsafe_allow_html=True,
)

if "investment_advice" not in st.session_state:
    st.session_state.investment_advice = None

if st.button("⚡ GENERATE INVESTMENT STRATEGY", use_container_width=True):
    if not NIM_API_KEY:
        st.error("NVIDIA_NIM_API_KEY not set. Add it to your .env file.")
    else:
        with st.spinner("Analysing grid data — NVIDIA NIM processing..."):
            try:
                gov_summary = "\n".join([
                    f"- {g['name']}: {g['source']} | Output {g['output_mw']:.1f} MW / "
                    f"Baseline {g['baseline_mw']:.0f} MW | "
                    f"Carbon {g['carbon_score_kg']:,.0f} kg CO2 | "
                    f"Status: {'ANOMALY' if g['anomaly'] else 'NORMAL'}"
                    for g in gov_data
                ])

                prompt = f"""You are NoorGrid's AI strategic energy advisor for Tunisia.

LIVE GRID DATA (real-time):
{gov_summary}

NATIONAL METRICS:
- National Carbon Index: {national_index:.4f} kg CO2 per capita
- Total CO2 deficit: {total_carbon:,.0f} kg CO2 across {len(gov_data)} monitored regions
- Total renewable output monitored: {total_mw:.1f} MW

VERIFIED 2024 STEG CONTEXT:
- Total grid capacity: 5,944 MW across 25 plants
- Renewables: only 5-6% of 19,395 GWh generated in 2024
- Grid losses: 22%
- Record peak demand: 4,888 MW (Aug 14, 2024 at 15:41)
- Algeria+Libya cover 14% of national demand — single point of failure
- Energy independence: 48% (2023) to 41% (2024)
- Government target: 35% renewable by 2030, 50% by 2035

Based on this real data provide a structured investment strategy:

SHORT TERM (0-2 years): 3 specific actionable investments. For each: what, which governorate, estimated cost, expected MW gain, why.

LONG TERM (3-10 years): 3 strategic infrastructure investments. For each: project, scope, grid independence impact, 2035 connection.

CRITICAL RISK: Single most dangerous vulnerability in Tunisia's grid and what NoorGrid prevents.

Be specific, data-driven, under 500 words."""

                nim_resp = httpx.post(
                    "https://integrate.api.nvidia.com/v1/chat/completions",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {NIM_API_KEY}",
                    },
                    json={
                        "model": "meta/llama-3.1-70b-instruct",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 1024,
                        "temperature": 0.4,
                        "top_p": 0.9,
                        "stream": False,
                    },
                    timeout=120,
                )
                nim_resp.raise_for_status()
                advice_text = nim_resp.json()["choices"][0]["message"]["content"]
                st.session_state.investment_advice = advice_text

            except Exception as e:
                st.session_state.investment_advice = f"ERROR: {e}"

if st.session_state.investment_advice:
    if st.session_state.investment_advice.startswith("ERROR"):
        st.error(st.session_state.investment_advice)
    else:
        lines = st.session_state.investment_advice.split("\n")
        rendered = ""
        for line in lines:
            line = line.strip()
            if not line:
                rendered += "<br/>"
            elif line.startswith("#") or line.isupper() or (line.endswith(":") and len(line) < 60):
                rendered += (
                    f'<div style="color:#76b900;font-weight:700;font-size:0.8em;'
                    f'letter-spacing:0.12em;margin:14px 0 6px;text-transform:uppercase">'
                    f'{line.replace("#","").strip()}</div>'
                )
            elif line.startswith("-") or line.startswith("*"):
                rendered += (
                    f'<div style="color:#c9d1d9;font-size:0.78em;line-height:1.7;'
                    f'padding-left:12px;border-left:2px solid #76b90030;margin:4px 0">'
                    f'{line}</div>'
                )
            else:
                rendered += (
                    f'<div style="color:#8b949e;font-size:0.78em;line-height:1.7;'
                    f'margin:3px 0">{line}</div>'
                )

        st.markdown(
            f'<div style="background:#040810;border:1px solid #76b90020;border-radius:5px;'
            f'padding:20px 24px;margin-top:12px;box-shadow:0 0 20px #76b90008">'
            f'{rendered}'
            f'<div style="margin-top:16px;font-size:0.6em;color:#1e2a38;letter-spacing:0.1em">'
            f'GENERATED BY NOORGRID INTELLIGENCE ENGINE — NVIDIA NIM · LLAMA 3.1 70B</div>'
            f'</div>',
            unsafe_allow_html=True,
        )

if st.session_state.get("drones_to_report"):
    display_drone_report(st.session_state.drones_to_report, gov_data)
