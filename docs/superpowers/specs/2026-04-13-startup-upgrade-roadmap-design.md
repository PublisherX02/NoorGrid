# NoorGrid — Startup Upgrade Roadmap
**Spec date:** 2026-04-13  
**Status:** Approved for implementation  
**Scope:** 20-week phased upgrade from ideathon prototype to B2G startup candidate  
**Target:** STEG pilot contract + investor readiness + MENA expansion foundation

---

## Strategic Goal

NoorGrid already has the rarest thing a startup can have: a real problem, real data, and field validation from a STEG senior official. What it lacks is the infrastructure, security, and business layer required to move from "impressive demo" to "signed pilot." This roadmap closes that gap in four phases.

**North star:** By week 20, NoorGrid should be deployable via a single command, accessible to authenticated STEG operators in French and Arabic, capable of alerting on-call engineers at 3AM when the grid is at risk, and ready to present to Flat6Labs, NVIDIA Inception, and the Ministry of Energy.

---

## Phase Overview

| Phase | Weeks | Theme | Unlock |
|---|---|---|---|
| 1 | 1–4 | Foundation & Credibility | "Real enough to sign a pilot" |
| 2 | 5–10 | Product Depth | "Operators actually want this daily" |
| 3 | 11–16 | Growth & Monetization | "Something people will pay for" |
| 4 | 17–20 | Investor-Ready | "Series A candidate story" |

---

## Phase 1 — Foundation & Credibility (Weeks 1–4)

### 1.1 All-24 Governorate Live Backend

**Problem:** 5 of 24 governorates have live weather data. 19 use hardcoded `mock_mw` and `mock_risk` constants in `grid.js`. Any STEG operator will notice this within 60 seconds of a live demo.

**Changes:**

*Backend — `backend/main.py`*
- Expand `_REGION_CFG` to all 24 governorates using coordinates from `grid.js`
- For `source: "Wind"` and `source: "Solar"` regions: use existing `wind_power_mw` / `solar_power_mw` formulas
- For `source: "Hydro"`: use `baseline_mw` as constant (weather-independent)
- For `source: "Mixed"`: use `0.60 × baseline_mw + 0.40 × wind_power_mw(wind, rotor_area, 0.35)` — 60% fossil baseline + weathered renewable offset; add `rotor_area` and `efficiency` to Mixed region configs
- Add `GET /weather/all` endpoint: calls `fetch_all_weather()` for all 24 regions, computes energy output for each, returns `[{region, wind_ms, irradiance, output_mw, risk_level, source}]` in a single response

*Frontend — `frontend-react/src/constants/grid.js`*
- Remove all `mock_risk` field usage from live data paths (keep as static fallback only when `/weather/all` is unavailable)
- Remove `mock_mw` from live data paths — live output comes from `/weather/all`
- Add `rotor_area` and `efficiency` defaults to Mixed-source governorates for the composite formula

*Frontend — `frontend-react/src/hooks/useWeather.js`*
- Change the weather fetch to call `/weather/all` instead of `/weather`
- Map the richer response shape `{output_mw, risk_level}` into the governorate objects at runtime
- Keep `mock_mw` / `mock_risk` from `grid.js` as the fallback when backend is offline

**Acceptance criteria:**
- All 24 governorate map markers reflect live weather-derived output and risk level
- Dashboard sidebar risk groupings (CRITICAL / HIGH / ELEVATED / NOMINAL) update from real data, not constants
- `/weather/all` response time < 3s for 24 parallel weather fetches

---

### 1.2 Persistent Real-Time Data Pipeline

**Problem:** Data only enters SQLite when a client hits `/weather`. There is no scheduled ingestion. If the server restarts, historical data is gone (SQLite at a local path). No query optimization.

**Changes:**

*Backend — `backend/main.py`*
- Add `APScheduler` (package: `apscheduler`) background scheduler that runs `fetch_all_weather()` every 15 minutes, regardless of active clients
- Start scheduler in the `startup` event handler; shut it down in a `shutdown` handler
- Log each scheduled run to stdout with count of records inserted

*Backend — `backend/db.py`*
- Enable WAL mode: `PRAGMA journal_mode=WAL` on every connection
- Add composite index: `CREATE INDEX IF NOT EXISTS idx_region_time ON weather_history(region, recorded_at)`
- Add `/weather/history/summary` endpoint: returns `{region, date, min_wind, max_wind, avg_wind, min_irradiance, max_irradiance, avg_output_mw}` grouped by day — avoids full-record dumps for Analytics charts

*Database — PostgreSQL migration path*
- Add `DATABASE_URL` to `.env`; when set, use `psycopg2` instead of SQLite
- Use `Supabase free tier` (managed PostgreSQL, automatic backups, connection pooling via PgBouncer)
- Migration: `Alembic` for schema versioning — add `alembic/` directory with initial migration from the SQLite schema
- SQLite remains the default for local dev; PostgreSQL is the production target

**Acceptance criteria:**
- Weather records accumulate in the database every 15 minutes with no client connected
- After a server restart, historical data from before the restart is intact
- Analytics 30-day chart query runs in < 500ms with the new index
- `DATABASE_URL` env var switches transparently between SQLite and PostgreSQL

---

### 1.3 Authentication & Multi-Tenancy Skeleton

**Problem:** `allow_origins=["*"]` and zero authentication. Anyone can hit `/rag/query` and consume NVIDIA NIM API credits. A B2G SaaS with no access control cannot be piloted by any government entity.

**Changes:**

*Backend — new file `backend/auth.py`*
- JWT-based auth using `python-jose` + `passlib[bcrypt]`
- `create_access_token(user_id, org_id, role)` → returns signed JWT (HS256, 24h expiry)
- `get_current_user(token: str)` → FastAPI `Depends` injectable that decodes and validates the JWT
- Roles: `operator` (full access), `analyst` (read-only: no `/grid/simulate` writes), `admin` (all routes + user management)

*Backend — `backend/db.py`*
- Add `users` table: `id, email, password_hash, org_name, org_id, role, created_at, last_login`
- Add `organizations` table: `id, name, tier, feature_flags (JSON text), created_at`
- Seed one default admin user on first startup if the table is empty

*Backend — `backend/main.py`*
- Add `POST /auth/register` and `POST /auth/login` endpoints (return JWT)
- Protect with `Depends(get_current_user)`: `/rag/query`, `/grid/simulate`, `/predict/blackout`, `/history/record`
- Leave public: `/health`, `/weather`, `/weather/all`, `/energy/*` (these are stateless calculations)
- Add `rate_limit` decorator on `/rag/query`: max 20 requests/hour per user (use `slowapi`)

*Frontend — new page `frontend-react/src/pages/Login.jsx`*
- Minimal login form: email + password
- On success: store JWT in `localStorage` under key `noorgrid_token`
- Redirect to `/dashboard`
- Add `ProtectedRoute` wrapper component — redirects to `/login` if no valid token

*Frontend — `frontend-react/src/services/api.js`*
- Inject `Authorization: Bearer <token>` header on all non-public requests
- On 401 response: clear token, redirect to `/login`

**Acceptance criteria:**
- Unauthenticated requests to `/rag/query` return 401
- Login flow works end-to-end (register → login → protected dashboard)
- JWT expiry is enforced (24h)
- Rate limiting returns 429 after 20 RAG requests/hour

---

### 1.4 Docker & One-Command Deployment

**Problem:** Setup requires 3 separate terminals. No Docker Compose. Government pilot partners will ask for a self-hosted deployment option on day one.

**Changes:**

*New file — `docker-compose.yml` (repo root)*
```yaml
services:
  backend:   # uvicorn backend.main:app, port 8000
  frontend:  # nginx serving Vite build, port 3000
  db:        # postgres:16-alpine, port 5432, named volume for persistence
```

*New file — `backend/Dockerfile`*
- Multi-stage: `python:3.11-slim` builder → final image
- Copies `requirements.txt`, installs deps, copies `backend/`
- Entrypoint: `uvicorn backend.main:app --host 0.0.0.0 --port 8000`

*New file — `frontend-react/Dockerfile`*
- Stage 1: `node:20-alpine` — `npm ci && npm run build`
- Stage 2: `nginx:alpine` — copies `/dist` to nginx html root
- `nginx.conf`: serves SPA with `try_files $uri /index.html`

*New file — `.env.example`*
- Documents all required env vars: `DATABASE_URL`, `NVIDIA_NIM_API_KEY`, `JWT_SECRET_KEY`, `BACKEND_URL`

*Updated `frontend-react/vite.config.js`*
- `VITE_API_URL` env var for API base URL (points to backend container in Docker, `localhost:8000` in dev)

**Acceptance criteria:**
- `docker compose up` from repo root starts all three services with no manual steps
- Frontend at `localhost:3000`, API at `localhost:8000`, DB persists across restarts via named volume
- `docker compose down -v` cleans up completely
- CI workflow updated to build and test the Docker images

---

### 1.5 French Localisation

**Problem:** STEG's official working language is French. An English-only platform cannot be demoed to any Tunisian government official. This is a Phase 1 gate, not a Phase 3 nicety.

**Changes:**

*Frontend — new directory `frontend-react/src/locales/`*
- `en.json` — English strings (extracted from current hardcoded text)
- `fr.json` — French translations of all static UI strings
- Package: `react-i18next` + `i18next`

*All 5 pages + key components*
- Replace hardcoded strings with `t('key')` calls
- Language toggle button in the Dashboard top bar and Navbar: `EN | FR`
- Selected language persisted in `localStorage`
- `dir="ltr"` always (Arabic RTL is Phase 3)

**Strings to prioritise (P0 for French):**
- All navigation labels, section headers, risk level labels (`CRITIQUE`, `ÉLEVÉ`, `NOMINAL`)
- Dashboard sidebar: "Grid Overview", "Active Anomalies", "National Carbon Index"
- Alert messages, error states, prevention actions from the prediction engine
- About page and Landing page marketing copy

**Acceptance criteria:**
- Toggling to FR switches all static text without page reload
- Risk level labels in badges and map tooltips translate correctly
- Language preference survives browser refresh

---

### 1.6 Error Monitoring (Sentry)

**Problem:** Production software with no error monitoring is flying blind. CRITICAL prediction failures, NIM API timeouts, and database errors will happen silently.

**Changes:**

*Backend — `backend/main.py`*
- Add `sentry_sdk` with FastAPI integration: `sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.1)`
- Capture unhandled exceptions automatically; add `sentry_sdk.capture_exception(e)` to the `/rag/query` catch block explicitly

*Frontend — `frontend-react/src/main.jsx`*
- Add `@sentry/react` with React Router integration
- Capture unhandled JS errors and React component errors

*Configuration*
- `SENTRY_DSN` env var (Sentry free tier, 5k errors/month)
- Source maps uploaded as part of the Vite build for readable stack traces

**Acceptance criteria:**
- Backend exceptions appear in Sentry within 30 seconds
- Frontend React errors captured with component stack trace
- No sensitive data (passwords, JWT tokens) in Sentry payloads

---

## Phase 2 — Product Depth (Weeks 5–10)

### 2.1 Alerting & Notification Engine

**Problem:** The dashboard shows risk levels but notifies nobody. An operator must be staring at the screen to catch a CRITICAL event. This is the feature that transforms NoorGrid from a dashboard into an operational system.

**Changes:**

*Backend — new file `backend/alerts.py`*
- Alert evaluation function: for each region in `_REGION_CFG`, compare current `risk_level` against subscribed thresholds
- Email delivery via Resend API (`resend` Python package, free tier: 3k emails/month)
- SMS delivery via Vonage API (`vonage` package; Twilio is an alternative)
- Webhook delivery: `httpx.post(webhook_url, json=alert_payload)`

*Backend — `backend/db.py`*
- New table `alert_subscriptions`: `id, user_id, region (nullable = all regions), risk_threshold (HIGH|CRITICAL), channels (JSON: {email, sms, webhook}), active, created_at`
- New table `alerts_log`: `id, region, risk_level, triggered_at, notified_via, ack_at (nullable)`

*Backend — `backend/main.py`*
- `POST /alerts/subscribe` — create or update a subscription (auth required)
- `GET /alerts/subscriptions` — list user's subscriptions
- `DELETE /alerts/subscriptions/{id}` — remove subscription
- `GET /alerts/log` — paginated alert history for the user's regions
- `POST /alerts/{id}/ack` — mark alert as acknowledged
- Add alert evaluation to the APScheduler 15-minute weather job: after ingesting weather, evaluate all subscriptions and fire any triggered alerts

*Frontend — new tab in Analytics or new page `Alerts.jsx`*
- Subscription form: region selector (all 24 or specific), threshold selector, channel checkboxes (email / SMS / webhook URL)
- Alert log table: timestamp, region, risk level, channel, acknowledged status
- "Test Alert" button to verify delivery without waiting for a real event

**Acceptance criteria:**
- Creating a subscription for Bizerte CRITICAL triggers a test email to the subscribed address
- Alert log records every triggered notification
- Acknowledgement clears the alert badge in the UI
- No duplicate alerts within a 1-hour window for the same region/threshold

---

### 2.2 Analytics Page Expansion

**Problem:** Analytics is limited to 48h history. No date range selector, no national correlation view, no proper CSV export.

**Changes — all in `Analytics.jsx` and one backend endpoint:**

*Backend*
- `GET /weather/history/summary?region=all&days=90` — uses the summary endpoint from 1.2 to return daily aggregates without full record dumps

*Frontend — `Analytics.jsx`*
- Date range selector: 24H | 7D | 30D | 90D | Custom (date picker)
  - Drives the `days` param on `getHistory()` calls
- Correlation Matrix heatmap (new card below charts):
  - For each pair of the 5 backend governorates, compute Pearson correlation of their `output_mw` series over the selected period
  - Render as a 5×5 grid with colour intensity (green = negative correlation / independent, red = high positive = simultaneous stress)
  - Label: "Regional Grid Correlation — high values indicate simultaneous stress risk"
- Carbon Trend line chart (new card):
  - Daily national CO₂/cap/day calculated from avg renewable output vs baseline fossil consumption
  - Overlay the 2030 NDC target line at 1.80 kg CO₂/cap/day
- KPI summary row (above charts):
  - For the selected period: Total MWh generated · Peak output day · Lowest-coverage day · Avg blackout probability · Days above ELEVATED
- CSV export: download uses `historyData` (already unified in the recent refactor); adds proper filename with date range

**Acceptance criteria:**
- 30-day view loads in < 2s using the summary endpoint
- Correlation matrix shows 5×5 grid with correct colour scale
- Carbon trend shows the correct NDC target line
- CSV export filename includes region and date range

---

### 2.3 RAG Chatbot — Tier A Upgrade

**Problem:** The chatbot has no conversation memory (every message starts fresh) and the system prompt is static. True RAG (with a vector store) is deferred until real STEG documents exist.

**Changes:**

*Backend — `backend/main.py`*
- `RAGRequest` model: add `history: list[{role, content}]` field (last 5 message pairs)
- Build the LLM messages array with history prepended before the current user message
- Expand system prompt with:
  - Full ONEM 2024 energy balance table (generation by source, losses, demand by sector)
  - STEG tariff structure (residential / industrial / agricultural tiers)
  - Historical crisis timeline (Aug 14 2024 minute-by-minute)
  - Q2/Q3 2025 planned maintenance schedule (from public STEG announcements)
  - Tunisia NDC targets 2030 (renewable share, CO₂/cap/day)

*Frontend — `frontend-react/src/components/AI/STEGChatbot.jsx`*
- Maintain `history` array in component state: `[{role: 'user'|'assistant', content: string}]`
- Pass last 5 pairs to every `/rag/query` call
- Add suggested follow-up questions after each AI response (3 context-aware suggestions based on keywords in the response)
- Add "Copy" button on AI responses

**Acceptance criteria:**
- Asking "tell me more about that" after a previous answer produces a coherent follow-up
- System prompt expansion doesn't exceed 2,000 tokens (verified in testing)
- Suggested follow-up questions appear within 200ms of response completion

---

### 2.4 Blackout Prediction Model Upgrade

**Problem:** The linear stress ratio produces unrealistically uniform results. No time-of-day curves, no seasonality, no Ramadan demand shift. A STEG engineer will not trust a model that ignores these factors.

**Note:** No scikit-learn or synthetic training data. The physics model has credibility a poorly-trained GB model does not. ML is deferred until 6 months of real pilot data exists.

**Changes — `backend/main.py` prediction loop:**

*Hour-of-day demand curve*
```python
# Replace flat estimated_demand_mw with hourly curve
hour = int(label[:2]) if label else 12
peak_factor = 1.15 if 8 <= hour <= 12 or 18 <= hour <= 22 else (0.75 if 1 <= hour <= 5 else 1.0)
estimated_demand_mw = avg_demand_mw * (1 + cooling_factor) * peak_factor
```

*Seasonality factor*
```python
# Summer (Jun–Sep): +12% baseline demand; Winter (Dec–Feb): +8% (heating)
import datetime
month = datetime.datetime.now().month
seasonal_factor = 1.12 if month in (6,7,8,9) else (1.08 if month in (12,1,2) else 1.0)
estimated_demand_mw *= seasonal_factor
```

*Ramadan demand shift*
```python
# Ramadan 2026: Feb 18 – Mar 19. Configurable via env var RAMADAN_START / RAMADAN_END
# During Ramadan: evening surge 20:00–23:00 (+20%), morning trough 06:00–10:00 (-15%)
RAMADAN_START = os.getenv("RAMADAN_START")  # "YYYY-MM-DD"
RAMADAN_END   = os.getenv("RAMADAN_END")
if in_ramadan(label_datetime):
    ramadan_factor = 1.20 if 20 <= hour <= 23 else (0.85 if 6 <= hour <= 10 else 1.0)
    estimated_demand_mw *= ramadan_factor
```

*Confidence interval*
- Add `probability_low` and `probability_high` fields to `HourlyPrediction` model
- `low = max(0, prob - 12)`, `high = min(100, prob + 12)` — ±12% interval reflecting model uncertainty
- Display as a shaded band in the blackout probability chart

*Backend — `backend/models.py`*
- Add `probability_low: float` and `probability_high: float` to `HourlyPrediction`

**Acceptance criteria:**
- Evening hours (18:00–22:00) show higher demand than midday for all regions
- Ramadan dates (configurable via env) shift predictions correctly
- Confidence interval band visible in the prediction chart

---

### 2.5 Audit Logs

**Problem:** Government contracts legally require audit trails. Cannot onboard a STEG operator account without logging what they do. Auth was built in Phase 1 — audit logs are the completion of that work.

**Changes:**

*Backend — `backend/db.py`*
- New table `audit_log`: `id, user_id, user_email, action, resource_type, resource_id, payload_hash (SHA256 of request body), ip_address, user_agent, timestamp`
- Actions to log: `LOGIN`, `LOGOUT`, `PREDICT_BLACKOUT`, `SIMULATE_GRID`, `RAG_QUERY`, `ALERT_SUBSCRIBE`, `ALERT_ACK`, `EXPORT_CSV`

*Backend — `backend/main.py`*
- Add `log_audit(request, user, action, resource)` helper called from protected endpoints
- `GET /admin/audit` endpoint (admin role only): paginated audit log with filters (user, action, date range)
- `GET /admin/audit/export` — downloads audit log as CSV

*Frontend*
- Admin panel stub page (`/admin`): shows audit log table with pagination
- Protected by `role === 'admin'` check in `ProtectedRoute`

**Acceptance criteria:**
- Every protected API call creates an audit log entry
- Admin CSV export contains all required fields
- Non-admin users receive 403 on `/admin/audit`

---

## Phase 3 — Growth & Monetization (Weeks 11–16)

### 3.1 Business Model Implementation

**Proposed tiers:**

| Tier | Target | Price | Features |
|---|---|---|---|
| Pilot | STEG district offices | Free (6 months) | 5 govs, dashboard, alerts |
| Operations | STEG national | $1,200/month | All 24 govs, RAG, analytics, API access |
| Ministry | MTDE | $3,500/month | Multi-user, audit logs, NDC reporting, custom alerts |
| Regional | MENA utilities (Morocco ONEE, Algeria Sonelgaz) | $6,000/month | Cross-border, localised data |

**Changes:**

*Backend — `backend/db.py`*
- `subscriptions` table: `id, org_id, tier, starts_at, ends_at, feature_flags (JSON)`
- Feature flags: `{"all_govs": true, "rag": true, "api_access": true, "audit_logs": true, "multi_user": true}`

*Backend — `backend/main.py`*
- `check_feature(feature_name)` FastAPI dependency: reads org's feature_flags from DB and raises 403 with upgrade message if feature is not enabled
- Apply to: `/rag/query` → requires `rag` flag; `/weather/all` for 24 govs → requires `all_govs` flag

*Backend*
- Stripe integration: `POST /billing/create-checkout-session` creates a Stripe Checkout session for Operations or Ministry tier
- Webhook `POST /billing/webhook` handles `checkout.session.completed` → updates `subscriptions` table
- (Full billing UI deferred — this is the plumbing layer)

*Frontend — new page `Pricing.jsx`*
- Three-column pricing cards (Pilot / Operations / Ministry)
- "Get Started" → `/billing/create-checkout-session`; Pilot → `/auth/register`
- Linked from Landing page and About page

**Acceptance criteria:**
- Pilot tier account can access 5-gov dashboard but receives 403 on `/rag/query`
- Stripe checkout session creates a valid payment link
- Feature flag update activates new features without restart

---

### 3.2 IoT Sensor Integration Stub

**Problem:** Production integration with STEG requires a real data ingestion path beyond OpenMeteo. This stub establishes the architecture and gives STEG a clear path to connecting their substations.

**Changes:**

*Backend — `backend/main.py`*
- `POST /ingest/sensor` — accepts: `{device_id, region, metric: "wind_ms"|"irradiance_wm2"|"output_mw"|"frequency_hz", value, timestamp}`
- Authenticated via API key (separate from user JWT): `X-API-Key` header, validated against `api_keys` table
- Stores to new `sensor_readings` table: `id, device_id, region, metric, value, timestamp, api_key_id`
- `GET /ingest/devices` — list registered devices and their last reading timestamp

*Backend — `backend/db.py`*
- `api_keys` table: `id, org_id, key_hash, label, last_used, created_at`
- `sensor_readings` table: `id, device_id, region, metric, value, recorded_at, api_key_id`

*Frontend — Dashboard governorate card*
- Add "Data Source" badge: `SENSOR` (green) | `WEATHER_API` (cyan) | `SIMULATED` (grey)
- Source determined by: sensor reading in last 30 minutes → SENSOR; else → WEATHER_API or SIMULATED

*Documentation — new file `docs/sensor-integration.md`*
- 3-step guide: generate API key, format payload, POST to `/ingest/sensor`
- Example with `curl` and Python `requests`
- Note on SCADA protocol translation (Modbus/DNP3 → REST adapter required — not in scope of this release)

**Acceptance criteria:**
- `POST /ingest/sensor` with valid API key stores a reading and returns 200
- Invalid or missing API key returns 401
- Data source badge appears on governorate cards where sensor data exists

---

### 3.3 Arabic RTL Support

**Problem:** Arabic-language support is required for broader MENA adoption and for non-French-speaking STEG staff.

**Changes:**

*Frontend — `frontend-react/src/locales/`*
- Add `ar.json` — Arabic translations (can use French JSON as base, translate with DeepL or a native speaker)
- Language toggle extended: `EN | FR | AR`

*Frontend — `frontend-react/src/App.jsx` or root*
- When `ar` language is active: set `document.documentElement.dir = 'rtl'` and `lang = 'ar'`
- Add `frontend-react/src/index.css` RTL overrides: flex-direction reversals, margin/padding mirror
- Test all 5 pages for RTL layout correctness

**Acceptance criteria:**
- Switching to AR reverses flex layouts and text alignment correctly
- JetBrains Mono (used for numeric data) is left unchanged in RTL mode (numerals are LTR in Arabic)
- No layout breakage on Dashboard (fixed-panel ops room is the hardest to RTL-ify)

---

### 3.4 Privacy Policy & Terms of Service

**Problem:** Tunisian INPDP data protection regulations require a privacy policy before processing user personal data (email addresses). Required for any B2G contract.

**Changes:**

*Frontend — new page `frontend-react/src/pages/Legal.jsx`*
- Privacy Policy section: data collected, storage location, retention period, user rights under INPDP
- Terms of Service section: permitted use, data ownership, service level (best-effort for pilot tier), liability limitations
- Linked in the footer of Landing, About, and Login pages

*Backend*
- `POST /auth/register` adds `accepted_tos_at` timestamp to the user record
- Registration form includes a "I agree to the Terms of Service" checkbox (required)

**Acceptance criteria:**
- Legal page reachable from all public pages via footer link
- Registration cannot complete without ToS checkbox checked
- `accepted_tos_at` is stored in the users table

---

### 3.5 Load Testing Baseline

**Problem:** A STEG pilot could have 50+ concurrent operators. Current system limits are unknown. Must be documented before any pilot onboarding.

**Changes:**

*New file — `tests/load/locustfile.py`*
- Scenarios: concurrent dashboard load (GET `/weather/all`), concurrent prediction requests (POST `/predict/blackout`), RAG burst (POST `/rag/query` × 20)
- Target: 50 concurrent users, 2-minute sustained test

*Run and document results*
- New file `docs/load-test-results.md`: P50/P95/P99 latency, error rate, max RPS before degradation
- Identify the bottleneck (likely `/rag/query` due to NIM API external latency)
- Document recommended concurrency limits per tier in the pricing page notes

**Acceptance criteria:**
- 50 concurrent users hit `/weather/all` with P95 < 2s
- Load test results committed to `docs/`
- Any endpoint with P95 > 5s under 10 concurrent users is flagged as a blocker

---

## Phase 4 — Investor-Ready (Weeks 17–20)

### 4.1 Public Demo Environment

**Problem:** Investors and conference judges need a live URL to click. "Request access to our localhost" does not convert.

**Changes:**

*Deployment*
- Deploy to Railway (backend + PostgreSQL) and Vercel (frontend)
- Register domain: `noorgrid.tn` (primary) + `noorgrid.com` (redirect)
- SSL certificates via Let's Encrypt (automatic on Railway/Vercel)

*Demo mode*
- `DEMO_MODE=true` env var: disables auth requirement for read-only routes (`/weather/all`, `/predict/blackout`, `/grid/simulate`)
- Seed database with 30 days of realistic synthetic weather history on demo environment
- Rate limiting on demo: `/rag/query` limited to 5 requests/hour per IP (no auth)
- "Request Pilot Access" CTA banner visible on all demo pages

*Frontend — Landing page*
- Add "Live Data" ticker: pulls real national grid stats from backend (total output across 24 govs, highest-risk region, carbon index)
- Add "Proof" section: STEG testimonial, ONEM statistics, the August 14 crisis as an interactive mini-timeline
- Replace stub contact form with Tally.so embed (free, sends email notification)
- Add Calendly embed for "Request a Demo" button

**Acceptance criteria:**
- `https://noorgrid.tn` returns the live dashboard within 3 seconds
- Demo mode works without login
- Tally form submission sends an email notification to the founder
- Calendly booking page is functional

---

### 4.2 Accelerator & Partner Applications

**To submit in Phase 4:**

| Program | Why | Action |
|---|---|---|
| NVIDIA Inception | Free NIM API credits, co-marketing, investor intros | 30-min online application at build.nvidia.com/inception |
| Flat6Labs Tunis | MENA-focused, B2G experience, convertible note typical | Submit deck + demo link; intake every 6 months |
| Catalyst Fund (climate tech) | Grant-based, no equity, climate infrastructure focus | Application + impact metrics |
| Microsoft for Startups | Azure credits, GitHub Enterprise, technical mentors | Submit at startups.microsoft.com |

**Deliverables:**
- 10-slide investor deck (problem / solution / market / product / traction / team / ask)
- 2-page executive summary in English and French
- Demo video (3 minutes: problem → dashboard → prediction → alert)

---

### 4.3 IEEE PES Technical Paper

**Why:** Establishes academic credibility, creates prior art for the prediction methodology, and gets the NoorGrid name into indexed literature before any competitor.

**Title proposal:** *"Physics-Based Regional Grid Stress Prediction in Data-Sparse Developing Markets: A Case Study of Tunisia's 24-Governorate Renewable Network"*

**Content outline:**
1. Problem: grid stress monitoring gap in MENA, August 14 crisis case study
2. Methodology: composite stress model (demand / capacity ratio + temperature deviation + rate-of-change + regional correlation)
3. Validation: comparison against the Aug 14 2024 event (would the model have triggered CRITICAL 72h prior?)
4. Results: predicted vs. actual stress for the 5 live-data governorates over 6 months of pilot data
5. Future work: real SCADA integration, ML layer with sufficient training data

**Target conference:** IEEE PES General Meeting 2027 (abstract deadline typically November of prior year)

---

### 4.4 Team & Advisory Board

**Current state:** One team member (PublisherX02). Investors pattern-match on team completeness.

**Actions:**
- Recruit 1 co-founder with STEG/Ministry network access (business development + government relations)
- Recruit 1 academic advisor: professor from École Nationale d'Ingénieurs de Tunis (ENIT) energy systems department
- Recruit 1 investment advisor: someone who has closed a B2G deal in MENA
- Update About page with real names, photos, LinkedIn links, and advisor bios

---

### 4.5 Landing Page Conversion

**Changes to `frontend-react/src/pages/Landing.jsx`:**
- Live stats ticker (from 4.1 demo environment)
- Interactive August 14 crisis mini-timeline: a scrollable card sequence showing the 15:41 event minute-by-minute
- Competitive positioning paragraph: "Today STEG monitors each substation in isolation with manual processes. NoorGrid is the first unified intelligence layer."
- "Built for STEG, validated by STEG" section with the senior official quote prominently displayed
- Tally form replaces the stub contact form (from 4.1)
- Calendly "Request a Demo" button

---

### 4.6 Internal Metrics Dashboard

**Problem:** Investors ask "what does your traction look like?" Current answer: none visible.

**Changes:**

*Backend — `backend/main.py`*
- `GET /admin/metrics` (admin only): returns `{active_users_7d, api_calls_24h, predictions_generated_total, alerts_triggered_week, rag_queries_week, uptime_pct_30d}`
- Computed from audit_log + alerts_log tables

*Frontend — `/admin` page*
- Add metrics cards row above audit log table
- Simple sparkline charts (Recharts) for API calls/day and predictions/day over last 30 days

---

## Files Modified Per Phase

### Phase 1
| File | Change |
|---|---|
| `backend/main.py` | All-24 `_REGION_CFG`, `/weather/all`, APScheduler, auth endpoints, Sentry |
| `backend/auth.py` | New — JWT auth, `get_current_user`, `create_access_token` |
| `backend/db.py` | WAL mode, index, users/orgs tables, PostgreSQL path, Alembic |
| `backend/Dockerfile` | New |
| `docker-compose.yml` | New |
| `frontend-react/Dockerfile` | New |
| `frontend-react/src/pages/Login.jsx` | New |
| `frontend-react/src/hooks/useWeather.js` | Switch to `/weather/all` |
| `frontend-react/src/services/api.js` | JWT injection, 401 handler |
| `frontend-react/src/locales/en.json` | New |
| `frontend-react/src/locales/fr.json` | New |
| `frontend-react/src/constants/grid.js` | Remove live-path mock_risk/mock_mw usage |
| `.env.example` | New |

### Phase 2
| File | Change |
|---|---|
| `backend/main.py` | Alert endpoints, RAG history, prediction model upgrade, audit logging |
| `backend/alerts.py` | New — alert evaluation, Resend, Vonage |
| `backend/db.py` | alert_subscriptions, alerts_log, audit_log tables |
| `backend/models.py` | RAGRequest history field, HourlyPrediction confidence interval |
| `frontend-react/src/pages/Analytics.jsx` | Date range, correlation matrix, carbon trend, KPI row |
| `frontend-react/src/components/AI/STEGChatbot.jsx` | History state, follow-up suggestions, copy button |

### Phase 3
| File | Change |
|---|---|
| `backend/main.py` | IoT ingest endpoints, feature flag middleware, Stripe webhook |
| `backend/db.py` | api_keys, sensor_readings, subscriptions tables |
| `frontend-react/src/pages/Pricing.jsx` | New |
| `frontend-react/src/pages/Legal.jsx` | New |
| `frontend-react/src/locales/ar.json` | New |
| `tests/load/locustfile.py` | New |

### Phase 4
| File | Change |
|---|---|
| `frontend-react/src/pages/Landing.jsx` | Live ticker, crisis timeline, Tally form, Calendly |
| `frontend-react/src/pages/About.jsx` | Team expansion, advisory board, competitive positioning |
| `frontend-react/src/pages/Admin.jsx` | New — metrics dashboard + audit log UI |
| `backend/main.py` | `/admin/metrics` endpoint, demo mode env var |

---

## Implementation Planning Note

This spec covers 20 weeks of work. Each phase should be planned and executed independently:
- **Phase 1** → one implementation plan (6 items, ~4 weeks)
- **Phase 2** → second plan, created after Phase 1 ships
- **Phases 3 & 4** → planned in sequence as prior phases complete

Do not create a single implementation plan for the full 20-week scope.

---

## Dependencies & Sequencing Rules

1. **1.3 (Auth) must complete before 2.5 (Audit Logs)** — audit logs need user identities
2. **1.2 (PostgreSQL path) must complete before 3.1 (Subscriptions)** — feature flags need reliable DB
3. **1.5 (French) must complete before 4.1 (Public demo)** — demo cannot be English-only
4. **2.1 (Alerting) must complete before 3.2 (IoT stub)** — sensors should be able to trigger alerts
5. **3.1 (Business model) must complete before 4.1 (Public demo)** — demo needs "Request Pilot" CTA that routes somewhere

---

## New Package Dependencies

### Backend (`requirements.txt` additions)
```
apscheduler>=3.10
python-jose[cryptography]>=3.3
passlib[bcrypt]>=1.7
slowapi>=0.1.9
sentry-sdk[fastapi]>=2.0
alembic>=1.13
psycopg2-binary>=2.9
resend>=2.0
vonage>=3.0
stripe>=10.0
```

### Frontend (`package.json` additions)
```json
"react-i18next": "^15.0",
"i18next": "^24.0",
"@sentry/react": "^8.0",
"locust": "N/A — Python dev dependency"
```

---

## Success Metrics per Phase

| Phase | Success Metric |
|---|---|
| 1 | Docker compose up in < 5 min · All 24 govs show live data · Login/logout works · French UI deployed |
| 2 | CRITICAL alert delivered by email in < 2 min of risk trigger · Analytics loads 30D chart in < 2s · Chatbot multi-turn coherent |
| 3 | Stripe test checkout completes · Sensor reading POSTed and appears in dashboard · Load test P95 < 2s at 50 users |
| 4 | Live URL at noorgrid.tn · NVIDIA Inception application submitted · IEEE PES abstract submitted · Tally form sends email |
