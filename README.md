# ReproTwin — Exposure-Aware Navigation

A research prototype that behaves like a navigation app (find a
destination, compare routes, start a ride, get a post-trip report) with an
added environmental-health layer: routes are compared on **travel time and
estimated air-pollution exposure**, not just speed. The rider's fixed
origin is Petaling Jaya, Klang Valley, but destination search, routing, and
environmental data all work nationwide across Malaysia — see "Nationwide
coverage" below. The demo/synthetic trip-history dataset (Rider Profile's
Overview/Exposure Map tabs, the AI model) is still Klang-Valley-scoped.

It is **not** a clinical product, not a fertility tool, and not a
commercial navigation product. It does not collect health data as part of
the core flow (see `/profile`'s Profile tab for the earlier, separate
research-prototype work on physiological context and longitudinal
exposure modelling — kept but not part of the core navigation
experience).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Try the home page: pick
a destination (free-text search anywhere in Malaysia, or one of the 10
popular-destination chips spanning multiple Peninsular states), compare
Fastest/Balanced/Low-exposure routes (real OpenStreetMap roads via OSRM),
start a ride, and (if you grant location permission) your actual GPS
trajectory is drawn and recorded.

## Nationwide coverage

- **Routing** — real OSRM road routing works anywhere in Malaysia reachable
  by road from the fixed Petaling Jaya origin. The 10 "popular destination"
  chips (`lib/constants.ts`'s `POPULAR_DESTINATIONS`) span Selangor,
  Negeri Sembilan, Malacca, Johor, Perak, Penang, Kedah and Pahang —
  verified with a real ~350 km OSRM route request during development
  (Petaling Jaya → George Town). East Malaysia (Sabah/Sarawak) is
  deliberately excluded from these chips: there is no road link across the
  South China Sea from a Peninsular origin, so that's a real geography
  fact, not an app limitation.
- **Environmental data (live + historical)** — works for *any* Malaysian
  coordinate, including East Malaysia, since `lib/liveEnvironment.ts` /
  `lib/liveOpenAQ.ts` / `lib/livePurpleAir.ts` all query by lat/lng. Verified
  directly against WAQI for Penang, Johor Bahru, Ipoh, Malacca, Kuantan,
  Kota Kinabalu, and Kuching during development — all returned real DOE
  station readings. Search any Malaysian location (Navigate's search bar,
  or the Exposure Map) to see its real current conditions.
- **Still Klang-Valley-scoped**: the synthetic 90-day demo trip-history
  dataset, the Exposure Map's hotspot locations, and the AI exposure model
  (all in `data/trips.json` etc.) — expanding that stays synthetic/fake
  data either way, just covering a wider area, and wasn't part of this
  round of changes.

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

### Live traffic (optional, separate axis from the three modes above)

A route's `traffic_level` input (which feeds both the exposure model and,
now, the route's own travel time) is synthetic by default — sampled from an
hour/road-type probability model (`lib/environment.ts`), not a real
measurement. Setting `TOMTOM_API_KEY` (`lib/liveTraffic.ts`) switches this
to [TomTom's Traffic Flow Segment Data API](https://developer.tomtom.com/),
which reports real current speed vs. typical free-flow speed for a point.
Free tier: 2,500 requests/day, no credit card required to register.

Two caveats this integration is deliberately built around:

- TomTom's free tier has no bulk "every segment in an area" endpoint the
  way WAQI's `map/bounds` does — Flow Segment Data is one point at a time.
  Rather than querying every one of a route's raw OSRM segments (which
  could be dozens per route × 4 candidate routes), each route samples a
  small, bounded number of points along its own geometry and every segment
  uses whichever sample is nearest to it — the same "average of the area
  passed through" approach already used for live PM2.5.
- OSRM's public routing profile has no live congestion awareness — its
  duration is a static, roughly free-flow estimate. When live traffic
  samples exist for a route, that route's travel time (and therefore its
  ranking as Fastest/Balanced) is scaled by the real average current-vs-
  free-flow ratio from those samples, rather than left at OSRM's static
  number.

Falls through cleanly to the synthetic model with zero fabricated data if
`TOMTOM_API_KEY` isn't set, a request fails, or a segment has no nearby
sample — see System Status → "Live traffic data" for whether it's active,
and a route's "Why this exposure?" panel for the actual per-request source.

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

- **Home** (`/`) — the core flow, formerly `/navigate`: destination search,
  real road-following route comparison, live GPS ride tracking, dynamic
  "higher exposure ahead" check against the pre-computed route model,
  post-ride summary, save to trip history.
- **AI Route Advisor** — full route reasoning: candidate comparison across
  Fastest/Balanced/Low-exposure, the "Why this exposure?" provenance panel
  (PM2.5/traffic source, station, measurement), and the exposure model's
  own metrics.
- **Air Quality** — nationwide live WAQI station map.
- **Traffic Data** — a live TomTom traffic snapshot at major cities
  nationwide (fixed sample points, not a station network — see
  `lib/liveTraffic.ts` for why).
- **Live Exposure Demo** — kept from earlier work.
- **Rider Profile** (`/profile`) — a tabbed page absorbing what used to be
  four separate routes: **Overview** (current status, exposure trend,
  route-recommendation preview, personalised recommendations — formerly
  the Dashboard), **Profile** (rider identity, digital twin stats,
  self-reported vs. observed, physiological context), **Trip History**
  (the demo/real dataset's trip list plus "My rides" → Trip Details), and
  **Exposure Map** (spatial hotspot view). Deep-link a specific tab with
  `/profile?tab=overview|profile|trips|map`.
- **System Status** — data source status, GPS/routing/environmental/traffic
  API health, model performance.

Digital Twin and the What-If Simulator (both duplicated stats already
covered by Rider Profile) were removed rather than folded in.

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
- `lib/liveTraffic.ts` — optional TomTom live traffic client (`TOMTOM_API_KEY`, off by default) feeding real `traffic_level` inputs and traffic-adjusted route travel times.
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
report). Map tiles, OSRM, Nominatim, OpenDOSM, and (optionally) WAQI/TomTom
are the live network dependencies.
