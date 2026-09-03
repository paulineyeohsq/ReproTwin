# ReproTwin — Exposure-Aware Navigation

A research prototype that behaves like a navigation app (find a
destination, compare routes, start a ride, get a post-trip report) with an
added environmental-health layer: routes are compared on **travel time and
estimated air-pollution exposure**, not just speed. Klang Valley, Malaysia
is the initial demonstration area.

It is **not** a clinical product, not a fertility tool, and not a
commercial navigation product. It does not collect health data as part of
the core flow (see `/profile` and `/digital-twin` under "Research tools"
for the earlier, separate research-prototype work on physiological
context and longitudinal exposure modelling — kept but not part of the
core navigation experience).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Try `/navigate`: pick
a destination (free-text search or one of the 4 Klang Valley demo
buttons), compare Fastest/Balanced/Low-exposure routes (real OpenStreetMap
roads via OSRM), start a ride, and (if you grant location permission) your
actual GPS trajectory is drawn and recorded.

## What's real vs. synthetic

| Layer | Status |
|---|---|
| Road network & routing | **Real** — OpenStreetMap via OSRM's public demo instance (`lib/routingEngine.ts`), no API key. Falls back to a hand-authored demo road network only if OSRM is unreachable. |
| Geocoding | **Real** — OpenStreetMap Nominatim, no API key (`lib/geocode.ts`). |
| Device GPS | **Real** — `navigator.geolocation.watchPosition()`, only after "Start Ride"; never fabricated. |
| Environmental data | **Real when loaded** (Malaysian OpenDOSM/data.gov.my CSVs, see below) or synthetic demo data. Either way, **not live** — no periodic polling, no API key for a live pollution feed; every reading is labelled with its source and "as of" timestamp. |
| Exposure calculation | Modelled estimate (PM2.5 × duration), always — never called a personal/measured exposure. |
| AI exposure model | Trained on the synthetic dataset only; UI states this explicitly rather than reporting a fabricated real-data accuracy figure. |
| Physiological data | Always synthetic; not part of the core navigation flow. |
| Trip storage | Real — browser IndexedDB (`lib/tripStore.ts`), not localStorage. No Supabase project is connected in this environment; the store's interface is deliberately storage-agnostic so a server-backed implementation can replace it later without touching any caller. |

## Real data mode vs demo mode

The banner at the top of every page shows which mode is active, detected
automatically by checking whether `.csv` files exist in **both** folders
below (exposure needs a real trajectory *and* real pollutant readings to
match against each other):

- `data/real/environment/` — Malaysian OpenDOSM/data.gov.my air-pollution
  data (columns: location, latitude\*, longitude\*, timestamp, pm25, pm10,
  no2, so2, o3, co — \*optional).
- `data/real/mobility/` — real-world urban mobility trajectory data
  (columns: timestamp, latitude, longitude, speed, bearing, trip_id,
  route_id).

Drop matching files into both folders and restart the dev server;
`lib/realDataEngine.ts` reconstructs trips, nearest-station/nearest-time
matches every GPS point to a real reading, and computes exposure — see
inline comments there for the full pipeline. 7/30/90-day totals show
"Insufficient real data for this exposure window" rather than a padded
partial number when the loaded range is short.

## Pages

- **Dashboard** — current location/environment, 90-day trend, a
  route-comparison preview, personalised recommendations.
- **Navigate** — the core flow: destination search, real road-following
  route comparison, live GPS ride tracking, dynamic "higher exposure
  ahead" check against the pre-computed route model, post-ride summary,
  save to trip history.
- **Exposure Map** — spatial hotspot view (Low/Moderate/High) with
  per-location detail.
- **Trip History** — the demo/real dataset's trip list, plus "My rides"
  (your own recorded rides) → **Trip Details** for any of your rides.
- **System Status** — data source status, GPS/routing/environmental API
  health, model performance.
- **Research tools** (secondary nav, kept from earlier work, not part of
  the core navigation product): AI Route Advisor, Digital Twin, What-If
  Simulator, Live Exposure Demo, Rider Profile.

## Regenerating the synthetic dataset / model

```bash
npm run gen:data    # writes data/trips.json, physiology.json, hotspots.json
npm run gen:model   # trains the exposure model on trips.json, writes data/model.json
```

## Project structure

- `lib/routingEngine.ts`, `lib/geocode.ts` — real external routing/geocoding clients (OSRM, Nominatim), each with a documented fallback.
- `lib/routeExposure.ts`, `lib/roadInference.ts` — turns a real route's geometry+speed into per-segment exposure using the existing environment/AI model.
- `lib/tripStore.ts` — IndexedDB trip persistence for rides recorded via Navigate.
- `lib/realDataAdapter.ts` / `lib/realDataEngine.ts` — CSV loading and spatial-temporal matching for real Malaysian datasets.
- `lib/dataAccess.ts` — the single server-only aggregation layer every page reads through, mode-aware (demo vs real) underneath a stable interface.
- `app/api/routes`, `app/api/geocode` — server-side proxies so the client never calls external APIs directly.
- `components/navigate/` — the live navigation UI.
- `app/trip-details/[id]` — client-rendered (reads IndexedDB, which only exists in the browser).

## Scope

No native/Apple/Huawei Health integration, no live government pollution
API (documented, not fabricated), no turn-by-turn voice navigation, no
Supabase (pending credentials — see TRL-7 report). Map tiles, OSRM, and
Nominatim are the only live network dependencies.
