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
| Environmental data | Three explicit modes — see "Environmental data investigation" below. Never mixes a real and a synthetic value without labelling which is which. |
| Exposure calculation | Modelled estimate (PM2.5 × duration), always — never called a personal/measured exposure. |
| AI exposure model | Trained on the synthetic dataset only; UI states this explicitly rather than reporting a fabricated real-data accuracy figure. |
| Physiological data | Always synthetic; not part of the core navigation flow. |
| Trip storage | Real — browser IndexedDB (`lib/tripStore.ts`), not localStorage. No Supabase project is connected in this environment; the store's interface is deliberately storage-agnostic so a server-backed implementation can replace it later without touching any caller. |

## Environmental data investigation

Before wiring anything up, this project investigated what official Malaysian
air-quality data is actually, legally, programmatically available. Summary
(full detail lives as comments in the modules referenced):

**Priority 1 — DOE/JAS (Department of Environment).** DOE operates a
real, real-time, station-level Air Pollutant Index network (APIMS, ~66
stations, published hourly, run out of the National Environmental Command
Centre). However, **no publicly documented, self-service developer API for
it was found.** `eqms.doe.gov.my` hosts the MyJAS EQMS system for manual/
direct lookups, not an open API a third-party app can call, and Malaysia's
official open-data API (`developer.data.gov.my`) does not expose it either.
Conclusion: DOE/JAS's own real-time feed is **not directly integrable**
without contacting DOE for API access.

**Priority 2 — OpenDOSM / data.gov.my.** This *is* real, live, and
genuinely integrated (`lib/historicalOpenDosm.ts` makes an actual network
call to `storage.data.gov.my/environment/air_pollution.csv`, CC BY 4.0
licensed, safe for a research prototype). Two hard limitations, verified by
fetching the dataset directly rather than assumed: it is **national, not
station-level** (no latitude/longitude column at all) and it updates
**roughly annually**, not in real time. It is shown only as a national
historical baseline (System Status), never used for road-segment spatial
matching — a national monthly average has no spatial resolution to give.

**Priority 3 — DOE research-data application.** The architecture supports
importing higher-resolution, station-level DOE data that a researcher
requests directly from DOE (`data/real/environment/*.csv`,
`lib/realDataAdapter.ts` / `lib/realDataEngine.ts`). This is the only path
that gives real, geo-located station readings, and it's what actually
powers spatial nearest-station matching for road-segment exposure and trip
reconstruction. No such dataset is bundled — the app runs on synthetic data
until one is dropped in.

**Optional live paths.** Three third-party options are wired up, tried in
this order, all **off by default** and requiring your own key:

1. [OpenAQ](https://explore.openaq.org/register) — a nonprofit that
   aggregates real ground-level air-quality data (government reference
   stations and other providers) under an open, attribution-based license
   (`lib/liveOpenAQ.ts`, `OPENAQ_API_KEY`). Whether it currently tracks any
   Klang Valley location wasn't confirmed during development (no test key
   was available) — it falls through cleanly to the next tier if nothing is
   nearby, and surfaces the actual data provider's name rather than
   assuming reference-grade accuracy.
2. [PurpleAir](https://develop.purpleair.com/) — a real crowd-sourced
   sensor network with genuine coverage in Klang Valley/Kuala Lumpur
   (`lib/livePurpleAir.ts`, `PURPLEAIR_API_KEY`). Important caveat: these
   are consumer-grade optical sensors, not government reference monitors —
   they're well documented to read PM2.5 high in humid conditions unless a
   correction factor is applied. This integration reports the raw,
   uncorrected value and labels it as such rather than implying
   DOE-reference accuracy.
3. [World Air Quality Index (WAQI/aqicn.org)](https://aqicn.org/api/) — a
   third-party aggregator that mirrors DOE's own APIMS feed in
   near-real-time (`lib/liveEnvironment.ts`, `WAQI_TOKEN`). Its terms
   restrict commercial use, forbid redistributing/caching the raw feed, and
   ask non-personal/organisational users to contact the WAQI team directly
   — treat this as a technical proof of what MODE B looks like, not a
   licensed production integration.

See `.env.example` for all three variables.

### The three modes

| Mode | Meaning | UI label |
|---|---|---|
| **B — Live** | `OPENAQ_API_KEY`, `PURPLEAIR_API_KEY`, or `WAQI_TOKEN` configured and the live fetch for this request succeeded | "Live environmental data" + source + observed/retrieved timestamps |
| **A — Historical** | A researcher-supplied DOE/JAS station CSV is loaded, OR the OpenDOSM national dataset | "Historical Malaysian environmental data" |
| **C — Synthetic** | No real source available | "Demonstration data — not live environmental observations" |

`lib/environmentalDataProvider.ts` is the single `EnvironmentalDataProvider`
abstraction every "current conditions" reading goes through — it always
returns a fully-provenanced `EnvironmentalReading` (never a bare number):
observation timestamp, retrieval timestamp, source, station name/distance
when applicable, and an explicit **measured vs. estimated** flag (a
nearest-station spatial match is always "estimated", never "measured at
this exact point"). Every exposure figure in the UI has a "Why this
exposure?" panel (`components/ui/ExposureProvenance.tsx`) tracing it back
through this chain — Route → Segment → Station/Model → Reading →
Timestamp → Exposure contribution.

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
- `lib/routeExposure.ts`, `lib/roadInference.ts` — turns a real route's geometry+speed into per-segment exposure using real station data when loaded, else the synthetic environment/AI model.
- `lib/environmentalDataProvider.ts` — the EnvironmentalDataProvider abstraction (live/historical/synthetic mode resolution + provenanced readings).
- `lib/liveOpenAQ.ts`, `lib/livePurpleAir.ts`, `lib/liveEnvironment.ts` — optional OpenAQ / PurpleAir / WAQI live clients (MODE B, off by default, tried in that order).
- `lib/historicalOpenDosm.ts` — real, live fetch of OpenDOSM's national monthly dataset (MODE A, national).
- `lib/tripStore.ts` — IndexedDB trip persistence for rides recorded via Navigate.
- `lib/realDataAdapter.ts` / `lib/realDataEngine.ts` — CSV loading and spatial-temporal matching for a researcher-supplied station-level DOE dataset (MODE A, station-level).
- `lib/dataAccess.ts` — the single server-only aggregation layer every page reads through, mode-aware (demo vs real) underneath a stable interface.
- `app/api/routes`, `app/api/geocode`, `app/api/environment` — server-side proxies so the client never calls external APIs (or sees `WAQI_TOKEN`) directly.
- `components/navigate/` — the live navigation UI.
- `components/ui/EnvironmentalModeBadge.tsx`, `FreshnessLabel.tsx`, `ExposureProvenance.tsx` — the shared mode/freshness/provenance UI used everywhere a pollutant reading or exposure figure is shown.
- `app/trip-details/[id]` — client-rendered (reads IndexedDB, which only exists in the browser).

## Scope

No native/Apple/Huawei Health integration, no direct DOE/JAS live API (none
was found to exist publicly — see "Environmental data investigation"; the
optional live path goes through a third-party aggregator instead), no
turn-by-turn voice navigation, no Supabase (pending credentials — see TRL-7
report). Map tiles, OSRM, Nominatim, OpenDOSM, and (optionally) WAQI are the
live network dependencies.
