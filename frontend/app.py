"""
NoorGrid — Military Operations Room Dashboard
Dark tactical renewable energy monitoring dashboard for Tunisia.
"""

import os
import time
from datetime import datetime, timezone, timedelta

import httpx
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

# ── Page config (must be first Streamlit call) ────────────────────────────────
st.set_page_config(
    page_title="NOORGRID // OPERATIONS",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Constants ─────────────────────────────────────────────────────────────────
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
TUNISIA_POPULATION = 11_800_000
BILLING_PERIOD_HOURS = 3  # billing window used for kWh estimates

GOVERNORATES: list[dict] = [
    {
        "name": "Bizerte",
        "source": "Wind",
        "lat": 37.2744,
        "lon": 9.8739,
        "baseline_mw": 97.0,
        "rotor_area": 7854.0,   # ~50 m radius turbine
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
ANOMALY_THRESHOLD = 0.20  # 20% below baseline
WIND_OPERATIONAL_THRESHOLD_MS = 3.0  # m/s — minimum for productive wind generation

# ── Military Ops Room CSS ─────────────────────────────────────────────────────
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');

    /* ── Global ────────────────────────────────────────────────── */
    html, body,
    [data-testid="stAppViewContainer"],
    [data-testid="stApp"],
    [data-testid="stMain"],
    .main, .block-container {
        background-color: #020408 !important;
        color: #e0f0e8;
        font-family: 'JetBrains Mono', 'Courier New', Courier, monospace !important;
    }
    * { font-family: 'JetBrains Mono', 'Courier New', Courier, monospace !important; }

    /* ── Sidebar ───────────────────────────────────────────────── */
    [data-testid="stSidebar"] {
        background-color: #030810 !important;
        border-right: 1px solid #00ff8840;
    }
    [data-testid="stSidebar"] * {
        font-family: 'JetBrains Mono', 'Courier New', Courier, monospace !important;
    }

    /* ── Header bar ────────────────────────────────────────────── */
    .ops-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #030810;
        border-bottom: 2px solid #00ff8860;
        border-top: 1px solid #00ff8830;
        padding: 12px 24px;
        margin-bottom: 8px;
        border-radius: 4px;
    }
    .ops-logo {
        font-size: 1.6em;
        font-weight: 700;
        color: #00ff88;
        letter-spacing: 0.12em;
        text-shadow: 0 0 14px #00ff8890;
    }
    .ops-clock {
        font-size: 1.3em;
        color: #06b6d4;
        letter-spacing: 0.1em;
        text-shadow: 0 0 8px #06b6d460;
    }
    .ops-status {
        font-size: 0.95em;
        color: #00ff88;
        letter-spacing: 0.08em;
    }
    .blink {
        animation: blink-dot 1.2s step-start infinite;
        color: #00ff88;
    }
    @keyframes blink-dot {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0; }
    }

    /* ── Scrolling ticker ──────────────────────────────────────── */
    .ticker-wrap {
        width: 100%;
        overflow: hidden;
        background: #030810;
        border-top: 1px solid #ff333340;
        border-bottom: 1px solid #ff333340;
        padding: 6px 0;
        margin-bottom: 12px;
    }
    .ticker-content {
        display: inline-block;
        white-space: nowrap;
        animation: scroll-left 30s linear infinite;
        color: #ff3333;
        font-size: 0.82em;
        letter-spacing: 0.06em;
    }
    @keyframes scroll-left {
        0%   { transform: translateX(100vw); }
        100% { transform: translateX(-100%); }
    }

    /* ── Sidebar metric blocks ─────────────────────────────────── */
    .metric-block {
        background: #030d18;
        border: 1px solid #00ff8850;
        border-radius: 6px;
        padding: 14px 16px;
        margin-bottom: 10px;
        box-shadow: 0 0 10px #00ff8820;
    }
    .metric-block.alert {
        border-color: #ff333380;
        box-shadow: 0 0 14px #ff333340;
    }
    .metric-label {
        font-size: 0.68em;
        color: #00ff8890;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        margin-bottom: 4px;
    }
    .metric-value {
        font-size: 1.55em;
        font-weight: 700;
        color: #06b6d4;
        letter-spacing: 0.04em;
    }
    .metric-value.red { color: #ff3333; }

    /* ── Terminal buttons ──────────────────────────────────────── */
    .stButton > button {
        background: transparent !important;
        border: 1px solid #00ff8860 !important;
        color: #00ff88 !important;
        font-family: 'JetBrains Mono', 'Courier New', Courier, monospace !important;
        font-size: 0.8em !important;
        letter-spacing: 0.06em !important;
        border-radius: 3px !important;
        padding: 6px 14px !important;
        transition: all 0.15s ease !important;
    }
    .stButton > button:hover {
        background: #00ff8815 !important;
        border-color: #00ff88 !important;
        box-shadow: 0 0 8px #00ff8840 !important;
    }
    /* Drone dispatch button — red terminal style */
    .drone-btn > button {
        background: transparent !important;
        border: 1px solid #ff333380 !important;
        color: #ff3333 !important;
        font-family: 'JetBrains Mono', 'Courier New', Courier, monospace !important;
        font-size: 0.78em !important;
        letter-spacing: 0.08em !important;
        border-radius: 3px !important;
        text-transform: uppercase !important;
        animation: pulse-border 1.8s ease-in-out infinite;
    }
    .drone-btn > button:hover {
        background: #ff333320 !important;
        border-color: #ff3333 !important;
        box-shadow: 0 0 10px #ff333350 !important;
    }
    @keyframes pulse-border {
        0%, 100% { box-shadow: 0 0 4px #ff333340; }
        50%       { box-shadow: 0 0 14px #ff333380; }
    }

    /* ── Governorate cards ─────────────────────────────────────── */
    .gov-card {
        background: #0a0f1a;
        border: 1px solid #00ff8850;
        border-radius: 6px;
        padding: 16px 18px;
        margin-bottom: 10px;
        box-shadow: 0 0 8px #00ff8818;
    }
    .gov-card.anomaly {
        border-color: #ff3333;
        box-shadow: 0 0 18px #ff333345;
    }
    .gov-title {
        font-size: 1.05em;
        font-weight: 700;
        color: #00ff88;
        letter-spacing: 0.08em;
        margin-bottom: 8px;
    }
    .gov-card.anomaly .gov-title { color: #ff3333; }
    .gov-stat { color: #06b6d4; font-size: 0.88em; margin: 3px 0; }
    .gov-label { color: #8ba89a; font-size: 0.72em; text-transform: uppercase; }

    /* ── Drone alert inside card ───────────────────────────────── */
    .drone-alert {
        background: #1a0505;
        border: 1px solid #ff3333;
        border-radius: 4px;
        padding: 8px 12px;
        color: #ff3333;
        font-size: 0.82em;
        letter-spacing: 0.08em;
        margin-top: 10px;
        animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.55; }
    }

    /* ── Wind context ──────────────────────────────────────────── */
    .wind-context {
        margin-top: 8px;
        padding: 5px 10px;
        background: #060e18;
        border-left: 2px solid #06b6d4;
        border-radius: 3px;
        font-size: 0.76em;
        color: #06b6d4;
    }

    /* ── Carbon panel ──────────────────────────────────────────── */
    .carbon-panel {
        background: #030810;
        border: 1px solid #06b6d450;
        border-radius: 6px;
        padding: 22px 24px;
        text-align: center;
        margin-top: 16px;
        box-shadow: 0 0 18px #06b6d420;
    }
    .carbon-value {
        font-size: 2.8em;
        font-weight: 700;
        color: #06b6d4;
        text-shadow: 0 0 16px #06b6d480;
        letter-spacing: 0.06em;
    }
    .carbon-label {
        font-size: 0.78em;
        color: #8ba89a;
        margin-top: 6px;
        letter-spacing: 0.06em;
    }

    /* ── Section headers ───────────────────────────────────────── */
    .section-header {
        font-size: 0.72em;
        letter-spacing: 0.18em;
        color: #00ff8870;
        text-transform: uppercase;
        border-bottom: 1px solid #00ff8830;
        padding-bottom: 4px;
        margin-bottom: 12px;
        margin-top: 16px;
    }

    /* ── Streamlit metric override ─────────────────────────────── */
    [data-testid="metric-container"] {
        background: #030d18 !important;
        border: 1px solid #00ff8840 !important;
        border-radius: 4px !important;
        padding: 10px 14px !important;
    }
    [data-testid="stMetricLabel"] { color: #8ba89a !important; font-size: 0.72em !important; }
    [data-testid="stMetricValue"] { color: #06b6d4 !important; }
    [data-testid="stMetricDelta"] { font-size: 0.78em !important; }

    /* ── Plotly chart background ───────────────────────────────── */
    .js-plotly-plot, .plotly, .plot-container { background: transparent !important; }

    /* ── Dividers ──────────────────────────────────────────────── */
    hr { border-color: #00ff8825 !important; }
    </style>
    """,
    unsafe_allow_html=True,
)


# ── Session state ─────────────────────────────────────────────────────────────
if "selected_gov" not in st.session_state:
    st.session_state.selected_gov = GOVERNORATES[0]["name"]
if "drone_dispatched" not in st.session_state:
    st.session_state.drone_dispatched = set()
if "weather_cache" not in st.session_state:
    st.session_state.weather_cache = None
if "weather_ts" not in st.session_state:
    st.session_state.weather_ts = 0


# ── Helper functions ──────────────────────────────────────────────────────────

def get_weather() -> dict[str, dict]:
    """Fetch weather from backend; cache for 5 minutes."""
    now = time.time()
    if st.session_state.weather_cache and (now - st.session_state.weather_ts) < 300:
        return st.session_state.weather_cache

    try:
        resp = httpx.get(f"{BACKEND_URL}/weather", timeout=15)
        resp.raise_for_status()
        raw = resp.json()["data"]
        cache = {row["region"]: row for row in raw}
        st.session_state.weather_cache = cache
        st.session_state.weather_ts = now
        return cache
    except Exception:
        return {}


def estimate_output(gov: dict, weather: dict) -> float:
    """Estimate current power output (MW) using live weather + backend API."""
    w = weather.get(gov["name"], {})
    try:
        if gov["source"] == "Wind":
            speed = w.get("wind_speed_ms", 0.0)
            if speed <= 0:
                return gov["baseline_mw"] * 0.75
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
            if irr <= 0:
                return gov["baseline_mw"] * 0.75
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

    return gov["baseline_mw"] * 0.75


def get_carbon(gov_name: str, consumption_kwh: float, renewable_kwh: float) -> float:
    """Call the carbon score endpoint."""
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


def load_billing_data() -> pd.DataFrame:
    data_path = os.path.join(
        os.path.dirname(__file__), "..", "data", "steg_billing_sample.csv"
    )
    try:
        return pd.read_csv(data_path)
    except FileNotFoundError:
        return pd.DataFrame(columns=["region", "consumption_kwh", "billing_period"])


def wind_context_label(wind_spd: float) -> str:
    """Return a formatted wind context string for display."""
    if wind_spd < WIND_OPERATIONAL_THRESHOLD_MS:
        return (
            f"Current wind: {wind_spd:.2f} m/s"
            f" — below {WIND_OPERATIONAL_THRESHOLD_MS:.0f} m/s operational threshold"
        )
    return f"Current wind: {wind_spd:.2f} m/s"


def get_expected_output(region: str, source_type: str, baseline_mw: float) -> float:
    tunis_hour = (datetime.now(timezone.utc) + timedelta(hours=1)).hour
    if source_type == "Solar" and (tunis_hour < 6 or tunis_hour > 19):
        return 0.0  # Nighttime — solar expects 0
    return baseline_mw


def is_anomaly(output_mw: float, baseline_mw: float, region: str = "", source_type: str = "") -> bool:
    expected = get_expected_output(region, source_type, baseline_mw)
    return output_mw < expected * 0.8 and expected > 0


# ── Build dashboard data ──────────────────────────────────────────────────────

def build_gov_data() -> list[dict]:
    weather = get_weather()
    billing_df = load_billing_data()

    rows = []
    for gov in GOVERNORATES:
        output = estimate_output(gov, weather)
        # Use most recent billing period consumption if available
        gov_billing = billing_df[billing_df["region"] == gov["name"]]
        if not gov_billing.empty:
            consumption = gov_billing.iloc[-1]["consumption_kwh"]
        else:
            consumption = gov["baseline_mw"] * 1000 * BILLING_PERIOD_HOURS  # rough proxy (kWh)

        renewable_kwh = output * 1000 * BILLING_PERIOD_HOURS  # assume billing period
        c_score = get_carbon(gov["name"], consumption, renewable_kwh)
        anomaly = is_anomaly(output, gov["baseline_mw"], gov["name"], gov["source"])

        wind_speed = (
            weather.get(gov["name"], {}).get("wind_speed_ms")
            if gov["source"] == "Wind"
            else None
        )

        rows.append(
            {
                "name": gov["name"],
                "source": gov["source"],
                "lat": gov["lat"],
                "lon": gov["lon"],
                "baseline_mw": gov["baseline_mw"],
                "output_mw": round(output, 2),
                "carbon_score_kg": round(c_score, 1),
                "anomaly": anomaly,
                "wind_speed_ms": wind_speed,
            }
        )
    return rows


gov_data = build_gov_data()
gov_lookup = {g["name"]: g for g in gov_data}

# ── Derived metrics ───────────────────────────────────────────────────────────
total_mw = round(sum(g["output_mw"] for g in gov_data), 2)
active_anomalies = [g for g in gov_data if g["anomaly"]]
total_carbon = sum(g["carbon_score_kg"] for g in gov_data)
national_index = total_carbon / TUNISIA_POPULATION

# ── Header bar ────────────────────────────────────────────────────────────────
tunis_now = datetime.now(timezone.utc) + timedelta(hours=1)
clock_str = tunis_now.strftime("%H:%M:%S")
date_str = tunis_now.strftime("%Y-%m-%d")

st.markdown(
    f"""
    <div class="ops-header">
      <div class="ops-logo">⚡ NOORGRID</div>
      <div class="ops-clock">{date_str} &nbsp; {clock_str} &nbsp;<span style="font-size:0.7em;color:#06b6d480">TUN</span></div>
      <div class="ops-status">SYSTEM STATUS&nbsp;&nbsp;<span class="blink">●</span>&nbsp;LIVE</div>
    </div>
    """,
    unsafe_allow_html=True,
)

# ── Anomaly ticker ────────────────────────────────────────────────────────────
if active_anomalies:
    def _ticker_item(g: dict) -> str:
        base = (
            f"⚠ ANOMALY — {g['name']} {g['source'].upper()} — {g['output_mw']} MW"
            + (f" — {g['wind_speed_ms']:.2f} m/s" if g.get("wind_speed_ms") is not None else "")
        )
        suffix = " — DRONE DISPATCHED" if g["name"] in st.session_state.drone_dispatched else " — AWAITING DISPATCH"
        return base + suffix

    ticker_items = "  ⬥  ".join(_ticker_item(g) for g in active_anomalies)
    st.markdown(
        f"""
        <div class="ticker-wrap">
          <div class="ticker-content">{ticker_items} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {ticker_items}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown(
        '<div class="section-header">GRID OVERVIEW</div>',
        unsafe_allow_html=True,
    )

    anomaly_class = "alert" if len(active_anomalies) > 0 else ""
    anomaly_val_class = "red" if len(active_anomalies) > 0 else ""

    st.markdown(
        f"""
        <div class="metric-block">
          <div class="metric-label">Total MW Monitored</div>
          <div class="metric-value">{total_mw} <span style="font-size:0.55em;color:#8ba89a">MW</span></div>
        </div>
        <div class="metric-block {anomaly_class}">
          <div class="metric-label">Active Anomalies</div>
          <div class="metric-value {anomaly_val_class}">{len(active_anomalies)}</div>
        </div>
        <div class="metric-block">
          <div class="metric-label">National Carbon Index</div>
          <div class="metric-value">{national_index:.4f} <span style="font-size:0.45em;color:#8ba89a">kg CO₂/cap</span></div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(
        '<div class="section-header" style="margin-top:18px">SELECT NODE</div>',
        unsafe_allow_html=True,
    )

    for gov in gov_data:
        icon = SOURCE_ICON.get(gov["source"], "⚡")
        status_tag = " [ANOMALY]" if gov["anomaly"] else ""
        label = f"> {gov['name']}{status_tag}"
        if st.button(label, key=f"btn_{gov['name']}", use_container_width=True):
            st.session_state.selected_gov = gov["name"]

    st.markdown("<hr/>", unsafe_allow_html=True)
    st.markdown(
        "<small style='color:#4a6058;font-size:0.65em'>SRC: Open-Meteo · STEG Billing</small>",
        unsafe_allow_html=True,
    )

# ── 3D Globe map ──────────────────────────────────────────────────────────────
st.markdown(
    '<div class="section-header">// TACTICAL MAP — GOVERNORATE GRID</div>',
    unsafe_allow_html=True,
)

try:
    import pydeck as pdk

    map_data = []
    for g in gov_data:
        color = [255, 51, 51, 230] if g["anomaly"] else [0, 255, 136, 200]
        map_data.append(
            {
                "name": g["name"],
                "lat": g["lat"],
                "lon": g["lon"],
                "output_mw": g["output_mw"],
                "source": g["source"],
                "color": color,
                "radius": 30000,
            }
        )

    scatter_layer = pdk.Layer(
        "ScatterplotLayer",
        data=map_data,
        get_position=["lon", "lat"],
        get_color="color",
        get_radius="radius",
        pickable=True,
        opacity=0.85,
        stroked=True,
        filled=True,
        line_width_min_pixels=2,
        get_line_color=[0, 0, 0, 80],
    )

    text_layer = pdk.Layer(
        "TextLayer",
        data=map_data,
        get_position=["lon", "lat"],
        get_text="name",
        get_size=14,
        get_color=[200, 240, 220, 230],
        get_alignment_baseline="'bottom'",
    )

    view_state = pdk.ViewState(
        latitude=34.0,
        longitude=9.5,
        zoom=5.5,
        pitch=40,
        bearing=0,
    )

    tooltip = {
        "html": (
            "<span style='font-family:monospace;color:#06b6d4'>"
            "<b style='color:#00ff88'>{name}</b><br/>"
            "SRC: {source}<br/>"
            "OUTPUT: {output_mw} MW"
            "</span>"
        ),
        "style": {
            "backgroundColor": "#030810",
            "color": "#06b6d4",
            "border": "1px solid #00ff8860",
            "fontFamily": "monospace",
        },
    }

    deck = pdk.Deck(
        layers=[scatter_layer, text_layer],
        initial_view_state=view_state,
        map_style="mapbox://styles/mapbox/dark-v10",
        tooltip=tooltip,
    )

    st.pydeck_chart(deck, use_container_width=True)

except ImportError:
    map_df = pd.DataFrame(
        [{"lat": g["lat"], "lon": g["lon"], "name": g["name"]} for g in gov_data]
    )
    st.map(map_df, zoom=5)
    st.caption("Install pydeck for the 3D globe view.")

# ── Governorate cards ─────────────────────────────────────────────────────────
st.markdown(
    '<div class="section-header">// NODE STATUS — GOVERNORATE GRID</div>',
    unsafe_allow_html=True,
)

cols = st.columns(len(gov_data))
for col, g in zip(cols, gov_data):
    with col:
        anomaly_cls = "anomaly" if g["anomaly"] else ""
        icon = SOURCE_ICON.get(g["source"], "⚡")
        status_str = "⚠ ANOMALY" if g["anomaly"] else "● NOMINAL"

        html = f"""
        <div class="gov-card {anomaly_cls}">
          <div class="gov-title">{g['name']}</div>
          <div class="gov-label">source</div>
          <div class="gov-stat">{icon} {g['source'].upper()}</div>
          <div class="gov-label" style="margin-top:6px">output</div>
          <div class="gov-stat">{g['output_mw']} MW</div>
          <div class="gov-label">baseline</div>
          <div class="gov-stat">{g['baseline_mw']} MW</div>
          <div class="gov-label">carbon score</div>
          <div class="gov-stat">{g['carbon_score_kg']:,.0f} kg CO₂</div>
        """

        if g["source"] == "Wind" and g.get("wind_speed_ms") is not None:
            html += f"""
          <div class="gov-label" style="margin-top:6px">wind speed</div>
          <div class="gov-stat">{g['wind_speed_ms']:.2f} m/s</div>
            """

        if g["anomaly"] and g["name"] in st.session_state.drone_dispatched:
            html += """
          <div class="drone-alert">🚁 DRONE DISPATCH INITIATED</div>
            """
        elif g["anomaly"]:
            html += """
          <div class="drone-alert" style="animation:none;opacity:0.9">⚠ ANOMALY DETECTED</div>
            """

        if g["anomaly"] and g["source"] == "Wind" and g.get("wind_speed_ms") is not None:
            ctx = wind_context_label(g["wind_speed_ms"])
            html += f'<div class="wind-context">🌬️ {ctx}</div>'

        html += "</div>"
        st.markdown(html, unsafe_allow_html=True)

        if g["anomaly"]:
            st.markdown('<div class="drone-btn">', unsafe_allow_html=True)
            if st.button(f"▶ DRONE DISPATCH → {g['name']}", key=f"drone_{g['name']}"):
                st.session_state.drone_dispatched.add(g["name"])
                st.rerun()
            st.markdown("</div>", unsafe_allow_html=True)

# ── Selected governorate detail ───────────────────────────────────────────────
sel = gov_lookup.get(st.session_state.selected_gov)
if sel:
    st.markdown(
        f'<div class="section-header">// NODE DETAIL — {sel["name"].upper()}</div>',
        unsafe_allow_html=True,
    )
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Energy Source", sel["source"])
    c2.metric("Output (MW)", f"{sel['output_mw']:.2f}", delta=f"{sel['output_mw'] - sel['baseline_mw']:.2f} vs baseline")
    c3.metric("Carbon Score", f"{sel['carbon_score_kg']:,.0f} kg CO₂")
    c4.metric("Status", "⚠ Anomaly" if sel["anomaly"] else "● Nominal")

    if sel["source"] == "Wind" and sel.get("wind_speed_ms") is not None:
        ctx = wind_context_label(sel["wind_speed_ms"])
        st.markdown(
            f'<div class="wind-context">🌬️ {ctx}</div>',
            unsafe_allow_html=True,
        )

# ── Consumption vs Renewable Production chart ─────────────────────────────────
st.markdown(
    '<div class="section-header">// CONSUMPTION vs RENEWABLE PRODUCTION</div>',
    unsafe_allow_html=True,
)

billing_df = load_billing_data()

if not billing_df.empty:
    avg_consumption = (
        billing_df.groupby("region")["consumption_kwh"].mean().to_dict()
    )
else:
    avg_consumption = {}

chart_govs = [g["name"] for g in gov_data]
consumption_vals = [
    avg_consumption.get(g["name"], g["baseline_mw"] * 1000 * BILLING_PERIOD_HOURS)
    for g in gov_data
]
renewable_vals = [g["output_mw"] * 1000 * BILLING_PERIOD_HOURS for g in gov_data]

fig = go.Figure(
    data=[
        go.Bar(
            name="Consumption (kWh)",
            x=chart_govs,
            y=consumption_vals,
            marker_color="#ff3333",
            marker_line_color="#ff000060",
            marker_line_width=1,
        ),
        go.Bar(
            name="Renewable Production (kWh)",
            x=chart_govs,
            y=renewable_vals,
            marker_color="#00ff88",
            marker_line_color="#00ff8860",
            marker_line_width=1,
        ),
    ]
)
fig.update_layout(
    barmode="group",
    paper_bgcolor="#020408",
    plot_bgcolor="#030810",
    font={"color": "#8ba89a", "family": "JetBrains Mono, Courier New, monospace"},
    xaxis={
        "gridcolor": "#00ff8815",
        "linecolor": "#00ff8830",
        "tickfont": {"color": "#06b6d4"},
    },
    yaxis={
        "gridcolor": "#00ff8815",
        "linecolor": "#00ff8830",
        "tickfont": {"color": "#06b6d4"},
        "title": "Energy (kWh)",
        "title_font": {"color": "#8ba89a"},
    },
    legend={
        "bgcolor": "#030810",
        "bordercolor": "#00ff8830",
        "borderwidth": 1,
        "font": {"color": "#8ba89a"},
    },
    margin={"l": 40, "r": 20, "t": 20, "b": 40},
)
st.plotly_chart(fig, use_container_width=True)

# ── National Carbon Index ─────────────────────────────────────────────────────
st.markdown(
    f"""
    <div class="carbon-panel">
      <div class="carbon-value">{national_index:.4f}</div>
      <div class="carbon-label">
        NATIONAL CARBON INDEX — kg CO₂ per capita<br/>
        TOTAL: {total_carbon:,.0f} kg CO₂ &nbsp;·&nbsp; {len(gov_data)} REGIONS &nbsp;·&nbsp; POP: {TUNISIA_POPULATION:,}
      </div>
    </div>
    """,
    unsafe_allow_html=True,
)
