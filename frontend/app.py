"""
NoorGrid — Streamlit Dashboard
Dark-themed renewable energy monitoring dashboard for Tunisia.
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
    page_title="NoorGrid — Tunisia Energy Monitor",
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

# ── Dark theme CSS ────────────────────────────────────────────────────────────
st.markdown(
    """
    <style>
    /* ── Global background ─────────────────────────────────────── */
    html, body, [data-testid="stAppViewContainer"],
    [data-testid="stApp"] {
        background-color: #0e1117;
        color: #e0e0e0;
    }
    [data-testid="stSidebar"] {
        background-color: #161b22;
        border-right: 1px solid #30363d;
    }
    /* ── Cards ────────────────────────────────────────────────── */
    .gov-card {
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 10px;
        padding: 18px 20px;
        margin-bottom: 12px;
    }
    .gov-card.anomaly {
        border-color: #f85149;
        box-shadow: 0 0 12px rgba(248,81,73,0.4);
    }
    .gov-title { font-size: 1.2em; font-weight: 700; margin-bottom: 6px; }
    .badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 12px;
        font-size: 0.78em;
        font-weight: 600;
        margin-left: 6px;
    }
    .badge-normal  { background: #1f6feb; color: #fff; }
    .badge-anomaly { background: #f85149; color: #fff; }
    .badge-wind    { background: #388bfd; color: #fff; }
    .badge-solar   { background: #d29922; color: #fff; }
    .badge-hydro   { background: #3fb950; color: #fff; }
    /* ── Drone alert ───────────────────────────────────────────── */
    .drone-alert {
        background: #2d1b1b;
        border: 2px solid #f85149;
        border-radius: 8px;
        padding: 14px 18px;
        color: #f85149;
        font-weight: 700;
        font-size: 1.1em;
        letter-spacing: 0.05em;
        margin-top: 10px;
        animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
        0%   { opacity: 1; }
        50%  { opacity: 0.6; }
        100% { opacity: 1; }
    }
    /* ── Carbon index panel ────────────────────────────────────── */
    .carbon-panel {
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 10px;
        padding: 20px 24px;
        text-align: center;
        margin-top: 18px;
    }
    .carbon-value { font-size: 2.4em; font-weight: 800; color: #58a6ff; }
    .carbon-label { font-size: 0.9em; color: #8b949e; margin-top: 4px; }
    /* ── Metric overrides ──────────────────────────────────────── */
    [data-testid="metric-container"] {
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 8px;
        padding: 10px 16px;
    }
    /* ── Wind context label ────────────────────────────────────── */
    .wind-context {
        margin-top: 8px;
        padding: 6px 10px;
        background: #1c2536;
        border-left: 3px solid #388bfd;
        border-radius: 4px;
        font-size: 0.82em;
        color: #8b949e;
    }
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

@st.cache_data(ttl=300)
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

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## ⚡ NoorGrid")
    st.markdown("### Tunisia Energy Monitor")
    st.divider()
    st.markdown("**Select Governorate**")

    for gov in gov_data:
        icon = SOURCE_ICON.get(gov["source"], "⚡")
        label = f"{icon} {gov['name']}"
        if gov["anomaly"]:
            label += " 🔴"
        if st.button(label, key=f"btn_{gov['name']}", use_container_width=True):
            st.session_state.selected_gov = gov["name"]

    st.divider()

    # Drone dispatch button
    anomalous = [g for g in gov_data if g["anomaly"]]
    if anomalous:
        st.markdown("**🚨 Anomalies Detected**")
        for g in anomalous:
            st.markdown(f"- {g['name']}")
        if st.button("🚁 Simulate Drone Dispatch", type="primary", use_container_width=True):
            for g in anomalous:
                st.session_state.drone_dispatched.add(g["name"])
            st.success("Drone dispatch simulated!")

    st.divider()
    st.markdown(
        "<small style='color:#8b949e'>Data: Open-Meteo & STEG Billing</small>",
        unsafe_allow_html=True,
    )

# ── Main header ───────────────────────────────────────────────────────────────
st.markdown("# ⚡ NoorGrid — Tunisia Renewable Energy Dashboard")
st.markdown("Real-time renewable energy monitoring across key Tunisian governorates.")

# ── Map ───────────────────────────────────────────────────────────────────────
try:
    import pydeck as pdk

    map_data = []
    for g in gov_data:
        color = [248, 81, 73, 220] if g["anomaly"] else [56, 139, 253, 200]
        map_data.append(
            {
                "name": g["name"],
                "lat": g["lat"],
                "lon": g["lon"],
                "output_mw": g["output_mw"],
                "source": g["source"],
                "color": color,
                "radius": 25000,
            }
        )

    layer = pdk.Layer(
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
    )

    text_layer = pdk.Layer(
        "TextLayer",
        data=map_data,
        get_position=["lon", "lat"],
        get_text="name",
        get_size=16,
        get_color=[255, 255, 255],
        get_alignment_baseline="'bottom'",
    )

    view_state = pdk.ViewState(
        latitude=34.0,
        longitude=9.5,
        zoom=5.5,
        pitch=0,
    )

    tooltip = {
        "html": (
            "<b>{name}</b><br/>"
            "Source: {source}<br/>"
            "Output: {output_mw} MW"
        ),
        "style": {
            "backgroundColor": "#161b22",
            "color": "#e0e0e0",
            "border": "1px solid #30363d",
        },
    }

    deck = pdk.Deck(
        layers=[layer, text_layer],
        initial_view_state=view_state,
        map_style="mapbox://styles/mapbox/dark-v10",
        tooltip=tooltip,
    )

    st.pydeck_chart(deck)

except ImportError:
    # Fall back to Streamlit's built-in map if pydeck is not available
    map_df = pd.DataFrame(
        [{"lat": g["lat"], "lon": g["lon"], "name": g["name"]} for g in gov_data]
    )
    st.map(map_df, zoom=5)
    st.caption("Install pydeck for an enhanced map experience.")

# ── Governorate cards ─────────────────────────────────────────────────────────
st.markdown("## 🗺️ Governorate Status")

cols = st.columns(len(gov_data))
for col, g in zip(cols, gov_data):
    with col:
        anomaly_cls = "anomaly" if g["anomaly"] else ""
        badge_cls = "badge-anomaly" if g["anomaly"] else "badge-normal"
        status_label = "ANOMALY" if g["anomaly"] else "Normal"
        src_badge_cls = f"badge-{g['source'].lower()}"
        icon = SOURCE_ICON.get(g["source"], "⚡")

        html = f"""
        <div class="gov-card {anomaly_cls}">
          <div class="gov-title">
            {icon} {g['name']}
            <span class="badge {badge_cls}">{status_label}</span>
          </div>
          <span class="badge {src_badge_cls}">{g['source']}</span>
          <hr style="border-color:#30363d;margin:10px 0"/>
          <b>Output:</b> {g['output_mw']} MW<br/>
          <b>Baseline:</b> {g['baseline_mw']} MW<br/>
          <b>Carbon score:</b> {g['carbon_score_kg']:,.0f} kg CO₂
        """

        # Real-time wind speed row for all Wind cards
        if g["source"] == "Wind" and g.get("wind_speed_ms") is not None:
            wind_spd = g["wind_speed_ms"]
            html += f"""
          <br/><b>🌬️ Wind speed:</b> {wind_spd:.2f} m/s
            """

        if g["anomaly"] and g["name"] in st.session_state.drone_dispatched:
            html += """
          <div class="drone-alert">🚁 DRONE DISPATCH INITIATED</div>
            """
        elif g["anomaly"]:
            html += """
          <div class="drone-alert" style="animation:none; opacity:0.85;">
            ⚠️ ANOMALY DETECTED
          </div>
            """

        # Weather context label under anomaly for Wind turbines
        if g["anomaly"] and g["source"] == "Wind" and g.get("wind_speed_ms") is not None:
            ctx = wind_context_label(g["wind_speed_ms"])
            html += f'<div class="wind-context">🌬️ {ctx}</div>'

        html += "</div>"
        st.markdown(html, unsafe_allow_html=True)

        status = "ANOMALY" if g["anomaly"] else "Normal"
        if status == "ANOMALY":
            if st.button(f"🚁 Dispatch Drone → {g['name']}", key=f"drone_{g['name']}"):
                st.success(f"✅ Drone dispatched to {g['name']}. Inspection in progress.")

# ── Selected governorate detail ───────────────────────────────────────────────
sel = gov_lookup.get(st.session_state.selected_gov)
if sel:
    st.markdown(f"## {SOURCE_ICON.get(sel['source'], '⚡')} {sel['name']} — Detail")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Energy Source", sel["source"])
    c2.metric("Output (MW)", f"{sel['output_mw']:.2f}", delta=f"{sel['output_mw'] - sel['baseline_mw']:.2f} vs baseline")
    c3.metric("Carbon Score", f"{sel['carbon_score_kg']:,.0f} kg CO₂")
    c4.metric("Status", "⚠️ Anomaly" if sel["anomaly"] else "✅ Normal")

    if sel["source"] == "Wind" and sel.get("wind_speed_ms") is not None:
        ctx = wind_context_label(sel["wind_speed_ms"])
        st.markdown(
            f'<div class="wind-context">🌬️ {ctx}</div>',
            unsafe_allow_html=True,
        )

# ── STEG Billing data ─────────────────────────────────────────────────────────
st.markdown("## 📊 STEG Billing Data")
# ── Consumption vs Renewable Production chart ─────────────────────────────────
st.markdown("## 📊 Consumption vs Renewable Production by Governorate")

billing_df = load_billing_data()

# Aggregate average consumption per governorate from billing data
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
            marker_color="#f85149",
        ),
        go.Bar(
            name="Renewable Production (kWh)",
            x=chart_govs,
            y=renewable_vals,
            marker_color="#3fb950",
        ),
    ]
)
fig.update_layout(
    barmode="group",
    title="Consumption vs Renewable Production by Governorate",
    xaxis_title="Governorate",
    yaxis_title="Energy (kWh)",
    paper_bgcolor="#0e1117",
    plot_bgcolor="#0e1117",
    font={"color": "#e0e0e0"},
    legend={"bgcolor": "#161b22", "bordercolor": "#30363d", "borderwidth": 1},
    title_font={"size": 18, "color": "#58a6ff"},
)
st.plotly_chart(fig, use_container_width=True)

# ── Tunisia National Carbon Index ─────────────────────────────────────────────
total_carbon = sum(g["carbon_score_kg"] for g in gov_data)
national_index = total_carbon / TUNISIA_POPULATION  # kg CO₂ per person

st.markdown(
    f"""
    <div class="carbon-panel">
      <div class="carbon-value">{national_index:.4f}</div>
      <div class="carbon-label">
        Tunisia National Carbon Index (kg CO₂ per capita)<br/>
        Total: {total_carbon:,.0f} kg CO₂ across {len(gov_data)} regions
        / {TUNISIA_POPULATION:,} population
      </div>
    </div>
    """,
    unsafe_allow_html=True,
)
