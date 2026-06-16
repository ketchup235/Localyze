# Localyze — Byte-Sized Business Boost

Localyze is a standalone web application that helps people **discover and support
small, local businesses** in their community. Enter a US zip code and Localyze
flies a 3D globe down to your area, hands off to an interactive map, and lists
the independent shops, restaurants, and services nearby — filtered to exclude
big chains. You can rate and review businesses, sort by rating or popularity,
save favorites, share and view community coupons, and export a report of your
saved places.

> Built for the FBLA **Coding & Programming** (2025–2026) topic *Byte-Sized
> Business Boost*. See [`docs/`](docs) for the language-selection rationale,
> UX design writeup, and third-party attribution.

---

## Feature → Rubric Mapping

Every required topic feature is implemented. This table lets a judge trace each
scored item directly to the code.

| Topic requirement | How Localyze does it | Code |
| --- | --- | --- |
| Sort businesses by **category** (food, retail, services) | Category filter pills; backend classifies each OSM result | `frontend/app/page.tsx`, `backend/app.py` (`fetch_local_data`) |
| Leave **reviews or ratings** | Review form (name, 1–5 stars, text) → persisted in SQLite | `POST /api/review` |
| Sort by **reviews or ratings** | Sort dropdown: Top Rated / Most Reviewed / Name | `filteredBusinesses` in `page.tsx` |
| **Save / bookmark** favorites | Heart toggle, stored in `localStorage`, "Saved" filter | `page.tsx` |
| Display **special deals or coupons** | Deal badges on cards; community coupon submission | `POST /api/coupon`, `GET /api/businesses` |
| **Verification step** to prevent bots | Server-side math CAPTCHA required before review/coupon submit | `GET /api/captcha`, `POST /api/verify-captcha` |

**Intelligent features (beyond the minimum):** a keyword help assistant
(`POST /api/help`) and a voice control that searches by spoken zip and sets
filters by voice (`components/voice/VoiceControl.tsx`).

---

## Architecture

```
┌─────────────────────────────┐        /api/* (proxied)        ┌────────────────────────┐
│  Frontend — Next.js 14 (TS)  │  ───────────────────────────▶  │  Backend — Flask (Py)   │
│  React 18, Tailwind          │                                │  SQLite (localyze.db)   │
│  three.js globe, Leaflet map │  ◀───────────────────────────  │                          │
└─────────────────────────────┘          JSON responses         └───────────┬────────────┘
                                                                              │  (live lookups)
                                                                              ▼
                                                          OpenStreetMap: Nominatim (geocode)
                                                                       + Overpass (places)
```

- **Frontend** (`frontend/`): the globe→map experience, results panel, business
  detail dialog, review/coupon forms, help chat, and voice control. All backend
  calls go through `frontend/lib/api.ts`.
- **Backend** (`backend/app.py`): resolves a zip to coordinates via Nominatim,
  queries Overpass for nearby businesses, filters out chains, and enriches each
  business with community reviews and coupons from SQLite. Results are cached per
  zip so repeat searches are instant and work offline.
- **Storage**: SQLite (`backend/localyze.db`) with three tables — `businesses`
  (cache), `reviews`, and `coupons`. Created automatically on first run.

---

## Running Locally

Two processes: the Flask API (port **5001**) and the Next.js dev server (port
**3000**). The frontend proxies `/api/*` to the backend automatically.

### 1. Backend (Flask)

```bash
cd backend
python3 -m venv venv && source venv/bin/activate   # optional but recommended
pip install -r requirements.txt
python app.py                                       # serves http://localhost:5001
```

### 2. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev                                          # serves http://localhost:3000
```

Open **http://localhost:3000** and enter a zip code (try `10001`, `19335`,
`60601`, or `90210`).

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PROXY_TARGET` | `http://localhost:5001` | Where Next.js proxies `/api/*` |
| `NEXT_PUBLIC_API_BASE_URL` | _(empty — same origin)_ | Override API base for the browser client |

---

## Offline / Unreliable-Internet Backup

Conference internet can be unreliable. Localyze degrades gracefully:

1. **Per-zip cache** — once a zip has been searched, its businesses are stored in
   SQLite and returned instantly on later searches, no network needed.
2. **Seed dataset** — for the demo zips, a bundled offline dataset
   (`backend/seed_data.py`) is used whenever the live OpenStreetMap lookup fails
   or returns nothing, so the app always shows results. The UI displays an
   **"Offline sample data"** badge when this fallback is active.

This satisfies the rubric requirement that the solution *run standalone* with a
prepared backup plan.

---

## Project Layout

```
backend/
  app.py            Flask routes + app wiring
  db.py             SQLite schema and connection helpers
  services.py       Geocoding, Overpass lookup, seed fallback, help matcher
  validation.py     Request validation helpers
  seed_data.py      Offline business dataset for demo zips
  requirements.txt  Python dependencies
  localyze.db       SQLite database (auto-created)
frontend/
  app/              Next.js app router (page + layout + globals)
  components/       UI, globe, map, voice, results components
  hooks/            Reusable React hooks
  lib/              api client, shared types, utils
docs/
  LANGUAGE_SELECTION.md   Why Python + TypeScript/React were chosen
  UX_DESIGN.md            Design rationale, user journey, accessibility
  ACCESSIBILITY.md        Accessibility features (voice, ARIA, reduced motion)
  ATTRIBUTION.md          Third-party libraries and OpenStreetMap credit
```

---

## Data & Attribution

Business location data is © **OpenStreetMap contributors**, available under the
[Open Database License (ODbL)](https://www.openstreetmap.org/copyright). See
[`docs/ATTRIBUTION.md`](docs/ATTRIBUTION.md) for the full list of open-source
libraries and licenses used.
