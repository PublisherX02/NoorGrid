# Crisis Simulation Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live drone tracking on the Tunisia map, AI-generated diagnosis reports triggered when drones return to base, and a corporate email preview + simulated send to engineers/technicians.

**Architecture:** A self-contained `DroneLayer` Leaflet overlay is added to `TunisiaMap`; a `useCrisisReport` hook manages background NIM report generation triggered by a drone-return callback; a `DiagnosisReportModal` shows the structured report + HTML email preview + recipient editor. Two new backend endpoints (`/report/generate`, `/report/send`) handle NIM inference and simulated dispatch.

**Tech Stack:** React 18, Leaflet (already installed), FastAPI, NVIDIA NIM (`meta/llama-3.1-70b-instruct`), pytest + FastAPI TestClient, inline-CSS email HTML.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/report.py` | NIM prompt builder + mock fallback |
| Create | `frontend-react/src/components/Map/DroneLayer.jsx` | Animated drone overlay on Leaflet map |
| Create | `frontend-react/src/hooks/useCrisisReport.js` | Background report generation state |
| Create | `frontend-react/src/components/Crisis/DiagnosisReportModal.jsx` | Report + email preview + send UI |
| Create | `tests/test_report.py` | Backend report endpoint tests |
| Modify | `backend/models.py` | Add ReportRequest, ReportResponse, ReportSendRequest, ReportSendResponse |
| Modify | `backend/main.py` | Register `/report/generate` and `/report/send` |
| Modify | `frontend-react/src/services/api.js` | Add `generateReport`, `sendReport` |
| Modify | `frontend-react/src/components/Map/TunisiaMap.jsx` | `mapReady` state + render DroneLayer |
| Modify | `frontend-react/src/components/Crisis/CrisisModal.jsx` | Pass `source` + `magnitude_mw` to `onTrigger` |
| Modify | `frontend-react/src/components/Crisis/AlertFeed.jsx` | Report status badge + VIEW REPORT button |
| Modify | `frontend-react/src/pages/Dashboard.jsx` | Wire `useCrisisReport` + `DiagnosisReportModal` |

---

## Task 1: Backend Pydantic Models

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1: Add the four report models to the bottom of `backend/models.py`**

Append after the last existing model:

```python
# ── Report generation ─────────────────────────────────────────────────────────

class CascadeRegionItem(BaseModel):
    name: str
    risk_level: str


class ReportRequest(BaseModel):
    region: str
    risk_level: str
    scenario_label: str
    source: str
    magnitude_mw: float
    cascade_regions: list[CascadeRegionItem] = []
    prevention_actions: list[str] = []


class ReportResponse(BaseModel):
    region: str
    risk_level: str
    scenario_label: str
    source: str
    magnitude_mw: float
    cascade_regions: list[CascadeRegionItem] = []
    prevention_actions: list[str] = []
    root_cause: str
    technical_fix: str
    impact_summary: str
    recommended_actions: list[str]
    generated_at: str


class ReportSendRequest(BaseModel):
    recipients: list[str]
    report: ReportResponse


class ReportSendResponse(BaseModel):
    sent: bool
    recipients: list[str]
    sent_at: str
```

- [ ] **Step 2: Verify the models import cleanly**

```bash
cd backend && python -c "from models import ReportRequest, ReportResponse, ReportSendRequest, ReportSendResponse; print('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/models.py
git commit -m "feat: add ReportRequest/Response and ReportSendRequest/Response models"
```

---

## Task 2: Backend `report.py` — NIM Prompt Builder

**Files:**
- Create: `backend/report.py`

- [ ] **Step 1: Write the failing test first**

Create `tests/test_report.py`:

```python
"""Tests for /report/generate and /report/send endpoints."""
import importlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    import db
    monkeypatch.setenv("NOORGRID_DB_PATH", str(tmp_path / "test_report.db"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db._engine = None
    importlib.reload(db)
    yield
    db._engine = None


@pytest.fixture()
def client():
    from main import app
    return TestClient(app)


VALID_REPORT_PAYLOAD = {
    "region": "Gabès",
    "risk_level": "CRITICAL",
    "scenario_label": "Nawara Field Failure",
    "source": "Solar",
    "magnitude_mw": 620.0,
    "cascade_regions": [{"name": "Médenine", "risk_level": "HIGH"}],
    "prevention_actions": ["Switch to fossil baseline", "Alert STEG Dispatch Center"],
}


def test_report_generate_returns_valid_structure(client):
    resp = client.post("/report/generate", json=VALID_REPORT_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert data["region"] == "Gabès"
    assert data["risk_level"] == "CRITICAL"
    assert data["scenario_label"] == "Nawara Field Failure"
    assert isinstance(data["root_cause"], str) and len(data["root_cause"]) > 10
    assert isinstance(data["technical_fix"], str) and len(data["technical_fix"]) > 10
    assert isinstance(data["impact_summary"], str) and len(data["impact_summary"]) > 10
    assert isinstance(data["recommended_actions"], list)
    assert len(data["recommended_actions"]) >= 2
    assert isinstance(data["generated_at"], str)


def test_report_generate_preserves_request_fields(client):
    resp = client.post("/report/generate", json=VALID_REPORT_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] == "Solar"
    assert data["magnitude_mw"] == 620.0
    assert len(data["cascade_regions"]) == 1
    assert data["cascade_regions"][0]["name"] == "Médenine"


def test_report_send_returns_sent_true(client):
    report = client.post("/report/generate", json=VALID_REPORT_PAYLOAD).json()
    resp = client.post("/report/send", json={
        "recipients": ["eng1@steg.com.tn", "ops@steg.com.tn"],
        "report": report,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["sent"] is True
    assert data["recipients"] == ["eng1@steg.com.tn", "ops@steg.com.tn"]
    assert isinstance(data["sent_at"], str) and len(data["sent_at"]) > 0


def test_report_send_empty_recipients_still_succeeds(client):
    report = client.post("/report/generate", json=VALID_REPORT_PAYLOAD).json()
    resp = client.post("/report/send", json={"recipients": [], "report": report})
    assert resp.status_code == 200
    assert resp.json()["sent"] is True
```

- [ ] **Step 2: Run tests to confirm they fail (endpoint not yet registered)**

```bash
cd C:/Users/moham/NoorGrid && python -m pytest tests/test_report.py -v --no-cov
```

Expected: 4 FAILs with `404 Not Found` or `connection error`.

- [ ] **Step 3: Create `backend/report.py`**

```python
"""NIM-based report generation for crisis incidents.

Exports:
  generate_report_from_nim(region, risk_level, scenario_label, source,
                           magnitude_mw, cascade_regions, prevention_actions)
  -> dict with keys: root_cause, technical_fix, impact_summary, recommended_actions
"""

import json
import os

import httpx

_NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
_NIM_MODEL = "meta/llama-3.1-70b-instruct"

# Used when NIM key is absent or NIM returns an error
_MOCK_REPORT = {
    "root_cause": (
        "The primary fault originates from a rapid decline in renewable energy output "
        "that exceeds the grid's immediate compensatory capacity. The fossil baseline "
        "is insufficient to cover the emerging deficit, creating a demand-supply "
        "imbalance that threatens regional grid stability."
    ),
    "technical_fix": (
        "Immediate activation of reserve thermal units at Ghannouch and Sousse plants "
        "is required. Cross-region load balancing should be engaged with STEG Dispatch "
        "Center to redistribute load from affected zones to northern segments with "
        "available headroom, while Algeria Transmed import capacity is maximised."
    ),
    "impact_summary": (
        "Approximately 15–20% of regional demand is at risk of uncontrolled load "
        "shedding if reserves are not activated within 30 minutes. Cascade failure "
        "probability is elevated in adjacent governorates."
    ),
    "recommended_actions": [
        "Activate STEG emergency reserve protocol — contact National Dispatch Center immediately",
        "Initiate 20% industrial load reduction in affected zone",
        "Open Algeria Transmed import channel to maximum available capacity",
        "Deploy field technicians to primary substation for manual override readiness",
    ],
}


async def generate_report_from_nim(
    region: str,
    risk_level: str,
    scenario_label: str,
    source: str,
    magnitude_mw: float,
    cascade_regions: list,
    prevention_actions: list,
) -> dict:
    """
    Call NVIDIA NIM to generate a structured incident diagnosis.
    Falls back to _MOCK_REPORT if the API key is absent or the call fails.
    Returns dict with: root_cause, technical_fix, impact_summary, recommended_actions.
    """
    nim_key = os.getenv("NVIDIA_NIM_API_KEY", "").strip()
    if not nim_key:
        return _MOCK_REPORT.copy()

    cascade_str = (
        ", ".join(f"{c['name']} ({c['risk_level']})" for c in cascade_regions)
        if cascade_regions
        else "None"
    )
    actions_block = (
        "\n".join(f"  - {a}" for a in prevention_actions)
        if prevention_actions
        else "  - None activated"
    )

    user_prompt = f"""You are a senior grid operations engineer at STEG Tunisia.
Analyze this power crisis and produce a diagnosis report.

INCIDENT DATA:
- Scenario: {scenario_label}
- Primary Region: {region}
- Risk Level: {risk_level}
- Energy Source: {source}
- Affected Capacity: {magnitude_mw} MW
- Cascade Regions: {cascade_str}
- Prevention Actions Activated:
{actions_block}

Respond with ONLY valid JSON (no markdown fences, no explanation) using exactly this structure:
{{
  "root_cause": "2-3 sentences on the technical root cause specific to this incident",
  "technical_fix": "2-3 sentences on the immediate operator resolution steps",
  "impact_summary": "1-2 sentences quantifying grid impact and time sensitivity",
  "recommended_actions": ["action 1", "action 2", "action 3", "action 4"]
}}"""

    payload = {
        "model": _NIM_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a STEG grid operations AI assistant. "
                    "Always respond with valid JSON only. No markdown. No preamble."
                ),
            },
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 600,
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {nim_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post(_NIM_URL, json=payload, headers=headers, timeout=30.0)
            resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        # Strip markdown code fences if the model wraps the JSON anyway
        if content.startswith("```"):
            parts = content.split("```")
            content = parts[1] if len(parts) > 1 else content
            if content.startswith("json"):
                content = content[4:]
        return json.loads(content.strip())
    except Exception:
        return _MOCK_REPORT.copy()
```

- [ ] **Step 4: Register the two endpoints in `backend/main.py`**

Add the import at the top of `main.py` (after the existing `from weather import fetch_all_weather` line):

```python
from report import generate_report_from_nim
```

Add the two new models to the existing models import block:

```python
from models import (
    ...existing imports...,
    ReportRequest,
    ReportResponse,
    ReportSendRequest,
    ReportSendResponse,
)
```

Append both endpoints **before** the RAG section (after the `/alerts/feed` endpoint, around line 499):

```python
# ── Report generation endpoints ───────────────────────────────────────────────

@app.post("/report/generate", response_model=ReportResponse, tags=["Report"])
async def generate_report(req: ReportRequest):
    """
    Generate an AI-powered incident diagnosis report for a triggered crisis.
    Calls NVIDIA NIM; falls back to mock report if the key is absent.
    """
    nim_result = await generate_report_from_nim(
        region=req.region,
        risk_level=req.risk_level,
        scenario_label=req.scenario_label,
        source=req.source,
        magnitude_mw=req.magnitude_mw,
        cascade_regions=[c.model_dump() for c in req.cascade_regions],
        prevention_actions=req.prevention_actions,
    )
    generated_at = datetime.datetime.utcnow().isoformat()
    return ReportResponse(
        region=req.region,
        risk_level=req.risk_level,
        scenario_label=req.scenario_label,
        source=req.source,
        magnitude_mw=req.magnitude_mw,
        cascade_regions=req.cascade_regions,
        prevention_actions=req.prevention_actions,
        root_cause=nim_result.get("root_cause", ""),
        technical_fix=nim_result.get("technical_fix", ""),
        impact_summary=nim_result.get("impact_summary", ""),
        recommended_actions=nim_result.get("recommended_actions", []),
        generated_at=generated_at,
    )


@app.post("/report/send", response_model=ReportSendResponse, tags=["Report"])
def send_report(req: ReportSendRequest):
    """
    Simulate dispatching an incident report email to engineers/technicians.
    Logs the send to stdout. Does not deliver real email (simulation mode).
    """
    sent_at = datetime.datetime.utcnow().isoformat()
    print(
        f"[report] SIMULATED SEND — scenario='{req.report.scenario_label}' "
        f"region={req.report.region} risk={req.report.risk_level} "
        f"recipients={req.recipients} sent_at={sent_at}"
    )
    return ReportSendResponse(sent=True, recipients=req.recipients, sent_at=sent_at)
```

- [ ] **Step 5: Run the tests — all 4 must pass**

```bash
cd C:/Users/moham/NoorGrid && python -m pytest tests/test_report.py -v --no-cov
```

Expected:
```
PASSED tests/test_report.py::test_report_generate_returns_valid_structure
PASSED tests/test_report.py::test_report_generate_preserves_request_fields
PASSED tests/test_report.py::test_report_send_returns_sent_true
PASSED tests/test_report.py::test_report_send_empty_recipients_still_succeeds
```

- [ ] **Step 6: Run existing test suite to confirm no regressions**

```bash
cd C:/Users/moham/NoorGrid && python -m pytest tests/ -v --no-cov
```

Expected: all previously passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add backend/report.py backend/main.py backend/models.py tests/test_report.py
git commit -m "feat: add /report/generate and /report/send endpoints with NIM fallback"
```

---

## Task 3: Frontend API Functions

**Files:**
- Modify: `frontend-react/src/services/api.js`

- [ ] **Step 1: Append `generateReport` and `sendReport` to the bottom of `api.js`**

```javascript
export const generateReport = async (payload) => {
  // payload: { region, risk_level, scenario_label, source, magnitude_mw,
  //            cascade_regions, prevention_actions }
  const resp = await client.post('/report/generate', payload)
  return resp.data
}

export const sendReport = async (recipients, report) => {
  const resp = await client.post('/report/send', { recipients, report })
  return resp.data
}
```

- [ ] **Step 2: Verify the app still builds**

```bash
cd frontend-react && npm run build 2>&1 | tail -5
```

Expected: `✓ built in` with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/services/api.js
git commit -m "feat: add generateReport and sendReport API functions"
```

---

## Task 4: DroneLayer Component

**Files:**
- Create: `frontend-react/src/components/Map/DroneLayer.jsx`

- [ ] **Step 1: Create `DroneLayer.jsx` with the full implementation**

```jsx
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { RISK_COLORS, GOVERNORATES } from '../../constants/grid'

// ── Timing constants ─────────────────────────────────────────────────────────
const ENROUTE_MS    = 8_000
const PATROL_MS     = 12_000
const RETURN_MS     = 8_000
const TICK_MS       = 100
const PATROL_RADIUS = 0.04   // degrees (~4.4 km)

const DRONE_COUNT = { CRITICAL: 3, HIGH: 2, ELEVATED: 1, NOMINAL: 1 }

// STEG simulated dispatch bases (one per geographic cluster)
const BASE_BY_REGION = {
  'North':       [37.55, 9.50],
  'North-East':  [37.55, 9.50],
  'North-West':  [37.55, 9.50],
  'Centre':      [35.50, 9.80],
  'Centre-East': [35.50, 9.80],
  'Centre-West': [35.50, 9.80],
  'South-East':  [33.20, 10.20],
  'South-West':  [33.20, 10.20],
}

function getBase(regionName) {
  const gov = GOVERNORATES.find(g => g.name === regionName)
  return BASE_BY_REGION[gov?.region] || [35.50, 9.80]
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function getPos(drone) {
  const { status, origin, target, progress, patrolAngle, returnProgress } = drone
  if (status === 'en-route')
    return lerp(origin, target, progress)
  if (status === 'patrolling')
    return [
      target[0] + PATROL_RADIUS * Math.sin((patrolAngle * Math.PI) / 180),
      target[1] + PATROL_RADIUS * Math.cos((patrolAngle * Math.PI) / 180),
    ]
  // returning | returned
  return lerp(target, origin, returnProgress)
}

function buildDroneIcon(color, status) {
  const flip   = status === 'returning' ? 'scaleX(-1)' : 'none'
  const flying = status === 'en-route' || status === 'returning'
  const pulse  = flying
    ? `<div style="position:absolute;inset:-4px;border-radius:50%;border:1.5px solid ${color};opacity:0.5;animation:droneRing 1s ease-out infinite;"></div>`
    : ''
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:20px;height:20px;display:flex;align-items:center;justify-content:center;">
      ${pulse}
      <span style="font-size:13px;transform:${flip};filter:drop-shadow(0 0 5px ${color});">✈</span>
    </div>`,
    iconSize:   [20, 20],
    iconAnchor: [10, 10],
  })
}

function buildEtaIcon(seconds, status) {
  if (status === 'patrolling' || seconds <= 0)
    return L.divIcon({ className: '', html: '', iconSize: [0, 0] })
  return L.divIcon({
    className: '',
    html: `<div style="
      background:rgba(10,15,26,0.85);
      border:1px solid rgba(255,255,255,0.2);
      border-radius:3px;padding:1px 5px;
      font-family:'JetBrains Mono',monospace;font-size:9px;color:#e2e8f0;
      white-space:nowrap;pointer-events:none;
    ">~${seconds}s</div>`,
    iconSize:   [36, 16],
    iconAnchor: [18, -4],
  })
}

export default function DroneLayer({ map, activeAlert, cascadeAlerts = [], onDronesReturned }) {
  const dronesRef       = useRef([])
  const markersRef      = useRef({})   // id → L.Marker  (drone icon)
  const etaMarkersRef   = useRef({})   // id → L.Marker  (ETA label)
  const traveledRef     = useRef({})   // id → L.Polyline (solid)
  const remainingRef    = useRef({})   // id → L.Polyline (dashed)
  const patrolCircleRef = useRef({})   // regionName → L.Circle
  const intervalRef     = useRef(null)
  const callbackRef     = useRef(onDronesReturned)
  const firedRef        = useRef(false)

  // Keep callback ref current without restarting the animation effect
  useEffect(() => { callbackRef.current = onDronesReturned }, [onDronesReturned])

  const alertId = activeAlert?.id ?? null

  useEffect(() => {
    if (!map) return

    // ── Tear down any previous session ──────────────────────────────────────
    clearInterval(intervalRef.current)
    Object.values(markersRef.current).forEach(m => m.remove())
    Object.values(etaMarkersRef.current).forEach(m => m.remove())
    Object.values(traveledRef.current).forEach(l => l.remove())
    Object.values(remainingRef.current).forEach(l => l.remove())
    Object.values(patrolCircleRef.current).forEach(c => c.remove())
    markersRef.current      = {}
    etaMarkersRef.current   = {}
    traveledRef.current     = {}
    remainingRef.current    = {}
    patrolCircleRef.current = {}
    dronesRef.current       = []
    firedRef.current        = false

    if (!activeAlert) return

    // ── Build drone fleet ────────────────────────────────────────────────────
    const regions = [
      { name: activeAlert.region, risk_level: activeAlert.risk_level },
      ...cascadeAlerts,
    ]
    const now = Date.now()
    const drones = []

    regions.forEach(({ name, risk_level }) => {
      const gov = GOVERNORATES.find(g => g.name === name)
      if (!gov) return
      const base   = getBase(name)
      const target = [gov.lat, gov.lon]
      const color  = RISK_COLORS[risk_level] || '#00ff88'
      const count  = DRONE_COUNT[risk_level] || 1

      for (let i = 0; i < count; i++) {
        // Stagger departure positions so drones fan out visually
        const origin = [
          base[0] + (i - (count - 1) / 2) * 0.06,
          base[1] + (i - (count - 1) / 2) * 0.06,
        ]
        drones.push({
          id:              `drone-${name}-${i}`,
          origin, target, color,
          status:          'en-route',
          phaseStartMs:    now,
          progress:        0,
          initPatrolAngle: i * (360 / count),   // staggered patrol start
          patrolAngle:     i * (360 / count),
          returnProgress:  0,
          regionName:      name,
        })
      }

      // Patrol perimeter circle — hidden until drones enter patrol phase
      patrolCircleRef.current[name] = L.circle(target, {
        radius:      PATROL_RADIUS * 111_000,   // degrees → metres (approx)
        color,
        weight:      1,
        dashArray:   '4 4',
        fillOpacity: 0,
        opacity:     0,
      }).addTo(map)
    })

    dronesRef.current = drones

    // ── Spawn initial Leaflet objects ────────────────────────────────────────
    drones.forEach(d => {
      markersRef.current[d.id] = L.marker(d.origin, {
        icon: buildDroneIcon(d.color, 'en-route'),
        zIndexOffset: 500,
      }).addTo(map)

      etaMarkersRef.current[d.id] = L.marker(d.origin, {
        icon: buildEtaIcon(Math.ceil(ENROUTE_MS / 1000), 'en-route'),
        zIndexOffset: 501,
      }).addTo(map)

      traveledRef.current[d.id]  = L.polyline([d.origin, d.origin],
        { color: d.color, weight: 1.5, opacity: 0.6 }).addTo(map)

      remainingRef.current[d.id] = L.polyline([d.origin, d.target],
        { color: d.color, weight: 1, opacity: 0.3, dashArray: '5 5' }).addTo(map)
    })

    // ── Tick ─────────────────────────────────────────────────────────────────
    intervalRef.current = setInterval(() => {
      const t = Date.now()

      dronesRef.current.forEach(d => {
        if (d.status === 'returned') return
        const elapsed = t - d.phaseStartMs

        // Phase transitions
        if (d.status === 'en-route') {
          d.progress = Math.min(1, elapsed / ENROUTE_MS)
          if (d.progress >= 1) {
            d.status       = 'patrolling'
            d.phaseStartMs = t
            if (patrolCircleRef.current[d.regionName])
              patrolCircleRef.current[d.regionName].setStyle({ opacity: 0.4 })
          }
        } else if (d.status === 'patrolling') {
          d.patrolAngle = d.initPatrolAngle + (elapsed / PATROL_MS) * 360
          if (elapsed >= PATROL_MS) {
            d.status       = 'returning'
            d.phaseStartMs = t
            if (patrolCircleRef.current[d.regionName])
              patrolCircleRef.current[d.regionName].setStyle({ opacity: 0 })
          }
        } else if (d.status === 'returning') {
          d.returnProgress = Math.min(1, elapsed / RETURN_MS)
          if (d.returnProgress >= 1) d.status = 'returned'
        }

        // Update position
        const pos = getPos(d)
        markersRef.current[d.id]?.setLatLng(pos)
        markersRef.current[d.id]?.setIcon(buildDroneIcon(d.color, d.status))
        etaMarkersRef.current[d.id]?.setLatLng(pos)

        if (d.status === 'en-route') {
          const eta = Math.ceil(((1 - d.progress) * ENROUTE_MS) / 1000)
          etaMarkersRef.current[d.id]?.setIcon(buildEtaIcon(eta, 'en-route'))
          traveledRef.current[d.id]?.setLatLngs([d.origin, pos])
          remainingRef.current[d.id]?.setLatLngs([pos, d.target])
          remainingRef.current[d.id]?.setStyle({ opacity: 0.3 })
        } else if (d.status === 'patrolling') {
          etaMarkersRef.current[d.id]?.setIcon(buildEtaIcon(0, 'patrolling'))
          traveledRef.current[d.id]?.setLatLngs([d.origin, d.target])
          remainingRef.current[d.id]?.setLatLngs([d.target, d.target])
          remainingRef.current[d.id]?.setStyle({ opacity: 0 })
        } else if (d.status === 'returning') {
          const eta = Math.ceil(((1 - d.returnProgress) * RETURN_MS) / 1000)
          etaMarkersRef.current[d.id]?.setIcon(buildEtaIcon(eta, 'returning'))
          traveledRef.current[d.id]?.setLatLngs([d.target, pos])
          remainingRef.current[d.id]?.setLatLngs([pos, d.origin])
          remainingRef.current[d.id]?.setStyle({ opacity: 0.3, dashArray: '5 5' })
        }
      })

      // Fire callback once when every drone has returned
      if (
        dronesRef.current.length > 0 &&
        dronesRef.current.every(d => d.status === 'returned') &&
        !firedRef.current
      ) {
        firedRef.current = true
        clearInterval(intervalRef.current)
        callbackRef.current?.()
      }
    }, TICK_MS)

    return () => clearInterval(intervalRef.current)
  }, [map, alertId]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
```

- [ ] **Step 2: Verify the file is syntactically valid**

```bash
cd frontend-react && node --input-type=module <<'EOF'
import('/src/components/Map/DroneLayer.jsx').catch(e => { if (!e.message.includes('Cannot use import')) throw e })
console.log('syntax OK')
EOF
```

If the above fails on Windows, just run a build check instead:

```bash
cd frontend-react && npm run build 2>&1 | grep -E "error|Error|✓"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/components/Map/DroneLayer.jsx
git commit -m "feat: add DroneLayer — animated flight, patrol sweep, trajectory lines with ETA"
```

---

## Task 5: Update TunisiaMap to host DroneLayer

**Files:**
- Modify: `frontend-react/src/components/Map/TunisiaMap.jsx`

- [ ] **Step 1: Add `useState` to the existing React import and import `DroneLayer`**

In `TunisiaMap.jsx`, change:

```javascript
import { useEffect, useRef } from 'react'
```

to:

```javascript
import { useEffect, useRef, useState } from 'react'
import DroneLayer from './DroneLayer'
```

- [ ] **Step 2: Add `mapReady` state and set it after map init**

In the map-initialization `useEffect` (the one that creates `L.map`), after `mapRef.current = map` add `setMapReady(true)`, and in the cleanup set it back to `false`.

Change the hook signature from:

```javascript
export default function TunisiaMap({ weatherMap = {}, selectedGov, onSelectGov, liveRiskMap = {}, activeAlert = null, cascadeAlerts = [], style = {} }) {
  const { t } = useTranslation()
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markersRef   = useRef([])
```

to:

```javascript
export default function TunisiaMap({ weatherMap = {}, selectedGov, onSelectGov, liveRiskMap = {}, activeAlert = null, cascadeAlerts = [], droneProps = null, style = {} }) {
  const { t } = useTranslation()
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markersRef   = useRef([])
  const [mapReady, setMapReady] = useState(false)
```

- [ ] **Step 3: Set `mapReady` in the map lifecycle effect**

Find the map initialization `useEffect` (starts with `if (!containerRef.current) return`). Change its return/cleanup from:

```javascript
    return () => {
      map.remove()
      mapRef.current = null
    }
```

to:

```javascript
    mapRef.current = map
    setMapReady(true)

    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
```

Also **remove** the standalone `mapRef.current = map` line that appears just before the `return () =>` block (it was already there; now it's inside the block above — avoid duplication by removing the old one).

- [ ] **Step 4: Render DroneLayer inside the container div**

Find the final `return` statement in `TunisiaMap`. Change:

```jsx
  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        ...style,
      }}
    />
  )
```

to:

```jsx
  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', ...style }}
    >
      {mapReady && mapRef.current && droneProps && (
        <DroneLayer map={mapRef.current} {...droneProps} />
      )}
    </div>
  )
```

- [ ] **Step 5: Build to confirm no errors**

```bash
cd frontend-react && npm run build 2>&1 | tail -5
```

Expected: `✓ built in` with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend-react/src/components/Map/TunisiaMap.jsx
git commit -m "feat: TunisiaMap accepts droneProps prop and renders DroneLayer when map is ready"
```

---

## Task 6: `useCrisisReport` Hook

**Files:**
- Create: `frontend-react/src/hooks/useCrisisReport.js`

- [ ] **Step 1: Create the hook**

```javascript
import { useState, useEffect, useCallback } from 'react'
import { GOVERNORATES } from '../constants/grid'
import { generateReport } from '../services/api'

/**
 * useCrisisReport — manages background AI report generation for a crisis.
 *
 * Props:
 *   activeAlert   — the current active alert object (or null)
 *   cascadeAlerts — array of { name, risk_level }
 *   scenarioMeta  — { source, magnitude_mw } captured from the fired scenario
 *
 * Returns:
 *   reportStatus  — 'idle' | 'generating' | 'ready' | 'error'
 *   report        — null | ReportData object
 *   openReport    — boolean controlling DiagnosisReportModal visibility
 *   setOpenReport — setter
 *   onDronesReturned — callback to pass to DroneLayer
 */
export function useCrisisReport({ activeAlert, cascadeAlerts = [], scenarioMeta = {} }) {
  const [reportStatus, setReportStatus] = useState('idle')
  const [report,       setReport]       = useState(null)
  const [openReport,   setOpenReport]   = useState(false)

  // Reset when the alert is acknowledged (activeAlert → null)
  useEffect(() => {
    if (!activeAlert) {
      setReportStatus('idle')
      setReport(null)
      setOpenReport(false)
    }
  }, [activeAlert])

  const onDronesReturned = useCallback(async () => {
    if (!activeAlert) return
    setReportStatus('generating')

    // Look up source from GOVERNORATES if not supplied by scenarioMeta
    const gov    = GOVERNORATES.find(g => g.name === activeAlert.region)
    const source = scenarioMeta.source || gov?.source || 'Mixed'
    const magnitudeMw = scenarioMeta.magnitude_mw ?? 0

    try {
      const data = await generateReport({
        region:             activeAlert.region,
        risk_level:         activeAlert.risk_level,
        scenario_label:     activeAlert.scenario_label,
        source,
        magnitude_mw:       magnitudeMw,
        cascade_regions:    cascadeAlerts,
        prevention_actions: activeAlert.prevention_actions || [],
      })
      setReport(data)
      setReportStatus('ready')
    } catch {
      setReportStatus('error')
    }
  }, [activeAlert, cascadeAlerts, scenarioMeta])

  return { reportStatus, report, onDronesReturned, openReport, setOpenReport }
}
```

- [ ] **Step 2: Verify it imports cleanly**

```bash
cd frontend-react && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/hooks/useCrisisReport.js
git commit -m "feat: add useCrisisReport hook — triggers report generation when drones return"
```

---

## Task 7: Update AlertFeed — Report Status Badge

**Files:**
- Modify: `frontend-react/src/components/Crisis/AlertFeed.jsx`

- [ ] **Step 1: Add `reportStatus` and `onViewReport` props to `ActiveAlertCard`**

Change the function signature from:

```javascript
function ActiveAlertCard({ alert, cascadeAlerts = [], onAcknowledge }) {
```

to:

```javascript
function ActiveAlertCard({ alert, cascadeAlerts = [], onAcknowledge, reportStatus = 'idle', onViewReport }) {
```

- [ ] **Step 2: Insert the report status block between the prevention actions list and the ACKNOWLEDGE button**

Find this section in `ActiveAlertCard` (the divider + acknowledge button block):

```jsx
      {/* Divider */}
      <div style={{ height: '1px', background: `${color}22`, marginBottom: '8px' }} />

      {/* Prevention actions — plain list (checkboxes added in Task 5) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
        {(alert.prevention_actions || []).map((action, i) => (
          <div key={i} style={{ display: 'flex', gap: '6px', fontSize: '0.68rem', color: '#c0ccd8', lineHeight: 1.4 }}>
            <span style={{ color, flexShrink: 0 }}>▸</span>
            <span>{action}</span>
          </div>
        ))}
      </div>

      {/* Acknowledge */}
      <button
```

Replace it with:

```jsx
      {/* Divider */}
      <div style={{ height: '1px', background: `${color}22`, marginBottom: '8px' }} />

      {/* Prevention actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
        {(alert.prevention_actions || []).map((action, i) => (
          <div key={i} style={{ display: 'flex', gap: '6px', fontSize: '0.68rem', color: '#c0ccd8', lineHeight: 1.4 }}>
            <span style={{ color, flexShrink: 0 }}>▸</span>
            <span>{action}</span>
          </div>
        ))}
      </div>

      {/* Report status badge */}
      {reportStatus === 'generating' && (
        <div style={{
          marginBottom: '8px', padding: '6px 10px',
          background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.25)',
          borderRadius: '4px', fontSize: '0.65rem', fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700, color: '#ff9500', letterSpacing: '0.06em',
          animation: 'livePulse 1s ease-in-out infinite',
        }}>
          ⟳ ANALYZING — GENERATING REPORT…
        </div>
      )}
      {reportStatus === 'ready' && (
        <button
          onClick={onViewReport}
          style={{
            width: '100%', marginBottom: '8px', padding: '7px',
            background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.4)',
            borderRadius: '4px', color: '#00ff88', cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em',
          }}
        >
          VIEW REPORT ▶
        </button>
      )}
      {reportStatus === 'error' && (
        <div style={{
          marginBottom: '8px', padding: '6px 10px',
          background: 'rgba(255,51,51,0.06)', border: '1px solid rgba(255,51,51,0.2)',
          borderRadius: '4px', fontSize: '0.65rem', color: '#ff3333',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          ⚠ REPORT FAILED — backend unreachable
        </div>
      )}

      {/* Acknowledge */}
      <button
```

- [ ] **Step 3: Thread `reportStatus` and `onViewReport` through the `AlertFeed` export**

Change the `AlertFeed` export function signature from:

```javascript
export default function AlertFeed({ activeAlert, cascadeAlerts = [], historicalAlerts = [], onAcknowledge }) {
```

to:

```javascript
export default function AlertFeed({ activeAlert, cascadeAlerts = [], historicalAlerts = [], onAcknowledge, reportStatus = 'idle', onViewReport }) {
```

And update the `ActiveAlertCard` usage inside `AlertFeed` from:

```jsx
      {activeAlert && (
        <ActiveAlertCard
          alert={activeAlert}
          cascadeAlerts={cascadeAlerts}
          onAcknowledge={onAcknowledge}
        />
      )}
```

to:

```jsx
      {activeAlert && (
        <ActiveAlertCard
          alert={activeAlert}
          cascadeAlerts={cascadeAlerts}
          onAcknowledge={onAcknowledge}
          reportStatus={reportStatus}
          onViewReport={onViewReport}
        />
      )}
```

- [ ] **Step 4: Build to confirm no errors**

```bash
cd frontend-react && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend-react/src/components/Crisis/AlertFeed.jsx
git commit -m "feat: AlertFeed shows report status badge and VIEW REPORT button"
```

---

## Task 8: `DiagnosisReportModal` Component

**Files:**
- Create: `frontend-react/src/components/Crisis/DiagnosisReportModal.jsx`

- [ ] **Step 1: Create `DiagnosisReportModal.jsx`**

```jsx
import { useState } from 'react'
import { RISK_COLORS } from '../../constants/grid'
import { sendReport } from '../../services/api'

// ── Email color palette (works on white background) ──────────────────────────
const EMAIL_RISK_COLOR = {
  CRITICAL: '#cc0000', HIGH: '#cc5500', ELEVATED: '#997700', NOMINAL: '#006633',
}
const EMAIL_RISK_BG = {
  CRITICAL: '#fff0f0', HIGH: '#fff5ee', ELEVATED: '#fffde8', NOMINAL: '#f0fff8',
}

// ── Corporate HTML email builder ──────────────────────────────────────────────
function buildEmailHtml(report) {
  const riskColor = EMAIL_RISK_COLOR[report.risk_level] || '#333'
  const riskBg    = EMAIL_RISK_BG[report.risk_level]    || '#f9f9f9'
  const cascadeRows = report.cascade_regions?.length
    ? report.cascade_regions.map(c =>
        `<li style="margin-bottom:4px;font-size:13px;">
           ${c.name} — <span style="color:${EMAIL_RISK_COLOR[c.risk_level] || '#333'};font-weight:600;">${c.risk_level}</span>
         </li>`
      ).join('')
    : '<li style="font-size:13px;color:#666;">No cascade regions affected</li>'

  const actionsRows = (report.recommended_actions || [])
    .map((a, i) => `<li style="font-size:13px;margin-bottom:6px;">${i + 1}. ${a}</li>`)
    .join('')

  const prevRows = (report.prevention_actions || [])
    .map(a => `<li style="font-size:13px;margin-bottom:4px;">✓ ${a}</li>`)
    .join('')

  const date = report.generated_at
    ? new Date(report.generated_at).toLocaleString('en-GB', { timeZone: 'Africa/Tunis' })
    : new Date().toLocaleString('en-GB', { timeZone: 'Africa/Tunis' })

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">

  <!-- Header -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#00c46a;">
    <tr>
      <td style="padding:20px 32px;">
        <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">⚡ NoorGrid</span>
        <span style="color:rgba(255,255,255,0.75);font-size:13px;margin-left:12px;">STEG Grid Operations — Incident Report</span>
      </td>
    </tr>
  </table>

  <!-- Risk banner -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${riskBg};border-left:5px solid ${riskColor};">
    <tr>
      <td style="padding:14px 32px;">
        <span style="color:${riskColor};font-weight:700;font-size:16px;text-transform:uppercase;">${report.risk_level} INCIDENT ALERT</span>
        <span style="color:#666;font-size:13px;margin-left:16px;">${report.scenario_label}</span>
      </td>
      <td style="padding:14px 32px;text-align:right;color:#999;font-size:12px;">${date} TUN</td>
    </tr>
  </table>

  <!-- Body -->
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td>
        <div style="max-width:620px;margin:0 auto;background:#fff;padding:28px 32px;">

          <!-- Incident Overview -->
          <h2 style="font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #e8e8e8;padding-bottom:8px;margin-top:0;">Incident Overview</h2>
          <table width="100%" cellpadding="5" style="margin-bottom:20px;">
            <tr><td style="color:#666;font-size:13px;width:150px;">Scenario</td><td style="font-size:13px;font-weight:600;color:#1a1a1a;">${report.scenario_label}</td></tr>
            <tr><td style="color:#666;font-size:13px;">Primary Region</td><td style="font-size:13px;color:#1a1a1a;">${report.region}</td></tr>
            <tr><td style="color:#666;font-size:13px;">Energy Source</td><td style="font-size:13px;color:#1a1a1a;">${report.source}</td></tr>
            <tr><td style="color:#666;font-size:13px;">Affected Capacity</td>
                <td style="font-size:13px;font-weight:700;color:${riskColor};">${report.magnitude_mw} MW</td></tr>
            <tr><td style="color:#666;font-size:13px;">Risk Level</td>
                <td style="font-size:13px;font-weight:700;color:${riskColor};">${report.risk_level}</td></tr>
          </table>

          <!-- Cascade Impact -->
          <h2 style="font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #e8e8e8;padding-bottom:8px;">Cascade Impact</h2>
          <ul style="padding-left:18px;margin-bottom:20px;">${cascadeRows}</ul>

          <!-- Prevention Actions Activated -->
          <h2 style="font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #e8e8e8;padding-bottom:8px;">Prevention Actions Activated</h2>
          <ul style="padding-left:18px;margin-bottom:20px;">${prevRows}</ul>

          <!-- Root Cause -->
          <h2 style="font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #e8e8e8;padding-bottom:8px;">Root Cause Analysis</h2>
          <div style="background:#fffbe6;border-left:4px solid #e6a800;padding:12px 16px;border-radius:3px;margin-bottom:20px;">
            <p style="margin:0;font-size:13px;line-height:1.7;color:#333;">${report.root_cause}</p>
          </div>

          <!-- Recommended Actions -->
          <h2 style="font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #e8e8e8;padding-bottom:8px;">Recommended Actions</h2>
          <ol style="padding-left:18px;margin-bottom:20px;">${actionsRows}</ol>

          <!-- Technical Resolution -->
          <h2 style="font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #e8e8e8;padding-bottom:8px;">Technical Resolution</h2>
          <div style="background:#e8f5e9;border-left:4px solid #2e7d32;padding:12px 16px;border-radius:3px;margin-bottom:20px;">
            <p style="margin:0;font-size:13px;line-height:1.7;color:#333;">${report.technical_fix}</p>
          </div>

          <!-- Impact Summary -->
          <div style="background:#f5f5f5;padding:12px 16px;border-radius:3px;margin-bottom:8px;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#555;"><strong>Impact:</strong> ${report.impact_summary}</p>
          </div>

        </div>
      </td>
    </tr>
  </table>

  <!-- Footer -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#e8e8e8;">
    <tr>
      <td style="padding:14px 32px;text-align:center;font-size:11px;color:#888;">
        Auto-generated by NoorGrid Crisis Intelligence System &nbsp;·&nbsp; ${date}
        <br>This is a simulated dispatch — NoorGrid / STEG Operations Platform
      </td>
    </tr>
  </table>

</body>
</html>`
}

// ── Recipient chip ─────────────────────────────────────────────────────────────
function RecipientChip({ email, onRemove }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)',
      borderRadius: '4px', padding: '2px 8px',
      fontSize: '0.68rem', color: '#00ff88',
    }}>
      {email}
      <button
        onClick={() => onRemove(email)}
        style={{ background: 'none', border: 'none', color: '#8899aa', cursor: 'pointer', padding: 0, fontSize: '0.75rem', lineHeight: 1 }}
      >×</button>
    </span>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function DiagnosisReportModal({ report, onClose, defaultRecipients = [] }) {
  const [recipients, setRecipients] = useState(defaultRecipients)
  const [newEmail,   setNewEmail]   = useState('')
  const [sendStatus, setSendStatus] = useState('idle') // 'idle'|'sending'|'sent'|'error'

  const riskColor = RISK_COLORS[report.risk_level] || '#ff3333'
  const emailHtml = buildEmailHtml(report)

  const handleAddRecipient = () => {
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed.includes('@') || recipients.includes(trimmed)) return
    setRecipients(prev => [...prev, trimmed])
    setNewEmail('')
  }

  const handleSend = async () => {
    setSendStatus('sending')
    try {
      await sendReport(recipients, report)
      setSendStatus('sent')
    } catch {
      setSendStatus('error')
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#0a0f1a',
        border: `1px solid ${riskColor}33`,
        borderRadius: '12px',
        maxWidth: '960px', width: '100%',
        maxHeight: '92vh', overflowY: 'auto',
        fontFamily: "'Inter', sans-serif",
        display: 'flex', flexDirection: 'column',
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 24px',
          borderBottom: `1px solid ${riskColor}22`,
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem', fontWeight: 700, color: riskColor, letterSpacing: '0.1em' }}>
              INCIDENT DIAGNOSIS REPORT
            </div>
            <div style={{ fontSize: '0.7rem', color: '#8899aa', marginTop: '2px' }}>
              {report.scenario_label} · {report.region} · {new Date(report.generated_at).toLocaleTimeString('en-GB', { timeZone: 'Africa/Tunis', hour: '2-digit', minute: '2-digit', second: '2-digit' })} TUN
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', cursor: 'pointer', fontSize: '1.3rem' }}>×</button>
        </div>

        {/* ── Two-column body ─────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', flex: 1, minHeight: 0 }}>

          {/* LEFT — Ops summary */}
          <div style={{
            padding: '20px 24px',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '14px',
          }}>

            {/* Metadata */}
            <div>
              <div style={{ fontSize: '0.58rem', color: '#4a5568', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Incident Metadata</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[
                  { label: report.region, color: riskColor },
                  { label: report.source, color: '#06b6d4' },
                  { label: `${report.magnitude_mw} MW`, color: riskColor },
                ].map(({ label, color }) => (
                  <span key={label} style={{
                    fontSize: '0.68rem', fontWeight: 600,
                    color, background: `${color}14`,
                    border: `1px solid ${color}33`,
                    borderRadius: '4px', padding: '2px 8px',
                  }}>{label}</span>
                ))}
              </div>
            </div>

            {/* Cascade */}
            {report.cascade_regions?.length > 0 && (
              <div>
                <div style={{ fontSize: '0.58rem', color: '#4a5568', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>Cascade Regions</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {report.cascade_regions.map(c => {
                    const cc = RISK_COLORS[c.risk_level] || '#8899aa'
                    return (
                      <span key={c.name} style={{
                        fontSize: '0.65rem', fontWeight: 600,
                        color: cc, background: `${cc}14`,
                        border: `1px solid ${cc}33`,
                        borderRadius: '3px', padding: '2px 7px',
                      }}>{c.name}</span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Prevention actions */}
            <div>
              <div style={{ fontSize: '0.58rem', color: '#4a5568', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>Prevention Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(report.prevention_actions || []).map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.68rem', color: '#c0ccd8' }}>
                    <span style={{ color: '#00ff88', flexShrink: 0, marginTop: '1px' }}>✓</span>
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Root cause */}
            <div>
              <div style={{ fontSize: '0.58rem', color: '#4a5568', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>Root Cause Analysis</div>
              <div style={{
                padding: '10px 12px',
                background: 'rgba(255,149,0,0.06)',
                border: '1px solid rgba(255,149,0,0.2)',
                borderRadius: '4px',
                fontSize: '0.7rem', color: '#e2c97a', lineHeight: 1.6,
              }}>{report.root_cause}</div>
            </div>

            {/* Technical fix */}
            <div>
              <div style={{ fontSize: '0.58rem', color: '#4a5568', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>Technical Resolution</div>
              <div style={{
                padding: '10px 12px',
                background: 'rgba(6,182,212,0.06)',
                border: '1px solid rgba(6,182,212,0.2)',
                borderRadius: '4px',
                fontSize: '0.7rem', color: '#67e8f9', lineHeight: 1.6,
              }}>{report.technical_fix}</div>
            </div>

            {/* Impact summary */}
            <div style={{ fontSize: '0.65rem', color: '#8899aa', lineHeight: 1.5, fontStyle: 'italic' }}>
              {report.impact_summary}
            </div>

          </div>

          {/* RIGHT — Email preview + recipient editor */}
          <div style={{
            padding: '20px 24px',
            display: 'flex', flexDirection: 'column', gap: '14px',
            overflowY: 'auto',
          }}>
            <div style={{ fontSize: '0.58rem', color: '#4a5568', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Email Preview</div>

            {/* Email iframe */}
            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden', flex: 1, minHeight: '360px' }}>
              <iframe
                srcDoc={emailHtml}
                sandbox="allow-same-origin"
                title="Email preview"
                style={{ width: '100%', height: '100%', minHeight: '360px', border: 'none', background: '#fff' }}
              />
            </div>

            {/* Recipient editor */}
            <div>
              <div style={{ fontSize: '0.58rem', color: '#4a5568', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Recipients</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {recipients.map(e => (
                  <RecipientChip
                    key={e}
                    email={e}
                    onRemove={removed => setRecipients(prev => prev.filter(r => r !== removed))}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="email"
                  placeholder="Add recipient email…"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddRecipient() }}
                  style={{
                    flex: 1, background: '#0d1526',
                    border: '1px solid rgba(0,255,136,0.2)',
                    borderRadius: '4px', color: '#e2e8f0',
                    padding: '5px 10px', fontSize: '0.72rem',
                  }}
                />
                <button
                  onClick={handleAddRecipient}
                  style={{
                    background: 'rgba(0,255,136,0.08)',
                    border: '1px solid rgba(0,255,136,0.25)',
                    borderRadius: '4px', color: '#00ff88',
                    padding: '5px 12px', cursor: 'pointer',
                    fontSize: '0.7rem', fontWeight: 600,
                  }}
                >+ Add</button>
              </div>
            </div>

            {/* Send button */}
            {sendStatus !== 'sent' ? (
              <button
                onClick={handleSend}
                disabled={sendStatus === 'sending' || recipients.length === 0}
                style={{
                  width: '100%', padding: '10px',
                  background: sendStatus === 'sending' ? 'rgba(0,255,136,0.04)' : 'rgba(0,255,136,0.1)',
                  border: `1px solid ${sendStatus === 'sending' ? 'rgba(0,255,136,0.15)' : 'rgba(0,255,136,0.4)'}`,
                  borderRadius: '6px',
                  color: sendStatus === 'sending' ? '#4a5568' : '#00ff88',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em',
                  cursor: sendStatus === 'sending' || recipients.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {sendStatus === 'sending' ? 'SENDING…' : sendStatus === 'error' ? '⚠ RETRY SEND' : `SEND REPORT → ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}`}
              </button>
            ) : (
              <div style={{
                width: '100%', padding: '10px', textAlign: 'center',
                background: 'rgba(0,255,136,0.08)',
                border: '1px solid rgba(0,255,136,0.3)',
                borderRadius: '6px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.75rem', fontWeight: 700, color: '#00ff88',
              }}>
                ✓ REPORT SENT
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build to confirm no errors**

```bash
cd frontend-react && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/components/Crisis/DiagnosisReportModal.jsx
git commit -m "feat: add DiagnosisReportModal with ops summary, email preview, recipient editor"
```

---

## Task 9: Update CrisisModal to Pass Source and Magnitude

**Files:**
- Modify: `frontend-react/src/components/Crisis/CrisisModal.jsx`

- [ ] **Step 1: Update `handleFire` to pass `source` and `magnitude_mw` to `onTrigger`**

Find the `handleFire` function. Change:

```javascript
  const handleFire = async () => {
    let region, risk_level, scenario_label, cascade_regions
    if (isCustom) {
      region          = customRegion
      risk_level      = customRisk
      scenario_label  = customLabel.trim() || `Custom — ${region} ${risk_level}`
      cascade_regions = []
    } else {
      const s         = SCENARIOS[selected]
      region          = s.region
      risk_level      = s.risk_level
      scenario_label  = s.label
      cascade_regions = s.cascade_regions
    }
    try {
      await onTrigger(region, risk_level, scenario_label, cascade_regions)
      onClose()
    } catch (_) {
      setArmed(false)
    }
  }
```

to:

```javascript
  const handleFire = async () => {
    let region, risk_level, scenario_label, cascade_regions, source, magnitude_mw
    if (isCustom) {
      const gov       = GOVERNORATES.find(g => g.name === customRegion)
      region          = customRegion
      risk_level      = customRisk
      scenario_label  = customLabel.trim() || `Custom — ${region} ${risk_level}`
      cascade_regions = []
      source          = gov?.source || 'Mixed'
      magnitude_mw    = 0
    } else {
      const s         = SCENARIOS[selected]
      region          = s.region
      risk_level      = s.risk_level
      scenario_label  = s.label
      cascade_regions = s.cascade_regions
      source          = s.source
      magnitude_mw    = s.magnitude_mw
    }
    try {
      await onTrigger(region, risk_level, scenario_label, cascade_regions, source, magnitude_mw)
      onClose()
    } catch (_) {
      setArmed(false)
    }
  }
```

Also add `GOVERNORATES` to the import at the top:

```javascript
import { GOVERNORATES, RISK_COLORS, SOURCE_COLOR } from '../../constants/grid'
```

- [ ] **Step 2: Build to confirm no errors**

```bash
cd frontend-react && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/components/Crisis/CrisisModal.jsx
git commit -m "feat: CrisisModal passes source and magnitude_mw to onTrigger"
```

---

## Task 10: Wire Everything in Dashboard

**Files:**
- Modify: `frontend-react/src/pages/Dashboard.jsx`

- [ ] **Step 1: Add new imports at the top of Dashboard.jsx**

After the existing crisis imports add:

```javascript
import { useCrisisReport } from '../hooks/useCrisisReport'
import DiagnosisReportModal from '../components/Crisis/DiagnosisReportModal'
```

- [ ] **Step 2: Add `scenarioMeta` state and wire `useCrisisReport`**

Inside the `Dashboard` function body, after the existing alert state declarations:

```javascript
  const [scenarioMeta, setScenarioMeta] = useState({ source: 'Mixed', magnitude_mw: 0 })

  const { reportStatus, report, onDronesReturned, openReport, setOpenReport } =
    useCrisisReport({ activeAlert, cascadeAlerts, scenarioMeta })
```

- [ ] **Step 3: Update `onTrigger` in `CrisisModal` to capture scenario metadata**

Find this block in the JSX:

```jsx
          onTrigger={async (region, risk_level, scenario_label, cascadeRegions) => {
            const alert = await triggerSimulation(region, risk_level, scenario_label)
            handleAlertTriggered(alert, cascadeRegions)
          }}
```

Replace with:

```jsx
          onTrigger={async (region, risk_level, scenario_label, cascadeRegions, source, magnitude_mw) => {
            const alert = await triggerSimulation(region, risk_level, scenario_label)
            setScenarioMeta({ source: source || 'Mixed', magnitude_mw: magnitude_mw || 0 })
            handleAlertTriggered(alert, cascadeRegions)
          }}
```

- [ ] **Step 4: Pass `droneProps` to `TunisiaMap`**

Find the `<TunisiaMap` usage and add the `droneProps` prop:

```jsx
              <TunisiaMap
                weatherMap={weatherMap}
                selectedGov={selectedGov}
                onSelectGov={handleSelectGov}
                liveRiskMap={liveRiskMap}
                activeAlert={activeAlert}
                cascadeAlerts={cascadeAlerts}
                droneProps={activeAlert ? {
                  activeAlert,
                  cascadeAlerts,
                  onDronesReturned,
                } : null}
                style={{ height: '100%', width: '100%' }}
              />
```

- [ ] **Step 5: Thread `reportStatus` and `onViewReport` to `AlertFeed`**

Find the `<AlertFeed` usage and add the two new props:

```jsx
      <AlertFeed
        activeAlert={activeAlert}
        cascadeAlerts={cascadeAlerts}
        historicalAlerts={activeAlert ? alerts.filter((a) => a.id !== activeAlert?.id) : []}
        onAcknowledge={handleAcknowledge}
        reportStatus={reportStatus}
        onViewReport={() => setOpenReport(true)}
      />
```

- [ ] **Step 6: Render `DiagnosisReportModal` at the bottom of the component**

Add after the `{/* Alert feed */}` block and before the closing `</div>` of the `ops-room`:

```jsx
      {/* Diagnosis report modal */}
      {openReport && report && (
        <DiagnosisReportModal
          report={report}
          onClose={() => setOpenReport(false)}
          defaultRecipients={
            (import.meta.env.VITE_REPORT_RECIPIENTS || '')
              .split(',')
              .map(e => e.trim())
              .filter(Boolean)
          }
        />
      )}
```

- [ ] **Step 7: Build to confirm no errors**

```bash
cd frontend-react && npm run build 2>&1 | tail -5
```

Expected: `✓ built in` with no errors.

- [ ] **Step 8: Run the full backend test suite to confirm no regressions**

```bash
cd C:/Users/moham/NoorGrid && python -m pytest tests/ -v --no-cov
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add frontend-react/src/pages/Dashboard.jsx
git commit -m "feat: wire DroneLayer, useCrisisReport, and DiagnosisReportModal into Dashboard"
```

---

## Task 11: End-to-End Manual Smoke Test

- [ ] **Step 1: Start the backend**

```bash
cd C:/Users/moham/NoorGrid && uvicorn backend.main:app --reload --port 8000
```

- [ ] **Step 2: Start the frontend**

```bash
cd frontend-react && npm run dev
```

- [ ] **Step 3: Run the full crisis simulation flow**

1. Open `http://localhost:5173` in the browser
2. Click **⚡ SIMULATE CRISIS** in the top bar
3. Select **Nawara Field Failure** scenario → ARM → CONFIRM
4. Verify on the map: drone icons appear and fly from the North base toward Gabès
5. Verify trajectory lines (solid traveled, dashed ahead) and ETA labels update live
6. Verify patrol circle appears around Gabès when drones arrive (~8s)
7. Verify drones return after ~12s patrol
8. After drones land (~8s return), verify AlertFeed shows `⟳ ANALYZING…` badge
9. After ~3–5s, verify badge changes to `VIEW REPORT ▶`
10. Click **VIEW REPORT ▶** — verify DiagnosisReportModal opens
11. Verify left column shows root cause (amber box) and technical fix (cyan box)
12. Verify right column shows rendered email preview in iframe
13. Add a recipient email → click **SEND REPORT** → verify `✓ REPORT SENT`
14. Check backend stdout for `[report] SIMULATED SEND — ...` log line
15. Click **ACKNOWLEDGE** on AlertFeed → verify drones clear, modal cannot reopen

- [ ] **Step 4: Final commit if any minor fixes were applied during smoke test**

```bash
git add -p   # stage only intentional changes
git commit -m "fix: post-smoke-test adjustments"
```

---

## Self-Review Checklist (already verified)

- **Spec coverage:** DroneLayer (3 behaviors ✓), report on drone return ✓, `useCrisisReport` hook ✓, AlertFeed badge ✓, DiagnosisReportModal ✓, email template ✓, recipient editor ✓, `/report/generate` ✓, `/report/send` ✓
- **No placeholders:** all steps contain complete code
- **Type consistency:** `onDronesReturned` is a callback ref in `DroneLayer`, consumed via `callbackRef.current?.()` — matches `useCrisisReport`'s `onDronesReturned` function ✓; `droneProps` shape passed from Dashboard matches `DroneLayer` props ✓; `ReportResponse` shape matches `DiagnosisReportModal`'s `report` prop ✓
