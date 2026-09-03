# Real environmental data (MODE A — historical, station-level)

This folder is for a **researcher-supplied DOE/JAS station-level dataset**
(the "DOE research data application" path — see the root README's
"Environmental data investigation" section). Investigation during
development found no way to auto-download station-level, geo-located
Malaysian air-quality data — DOE/JAS's real-time APIMS network has no public
documented developer API, and OpenDOSM's own automatic dataset
(`lib/historicalOpenDosm.ts`, no setup needed) is national and monthly only,
with no station coordinates at all. Dropping a file here is how this
prototype supports the higher-resolution data a researcher can obtain
directly from DOE.

Drop one or more `.csv` files in this folder to activate this pipeline.

Expected columns (case-insensitive; extra columns are ignored):

```
location / station / "monitoring location"
latitude / lat        (optional — falls back to an approximate town anchor)
longitude / lng / lon  (optional)
date / timestamp / datetime
pm25 / pm2.5
pm10
no2
so2
o3
co
```

Any row missing a timestamp is skipped. Missing pollutant values are
allowed (left as `null`) — the adapter does not require every column.

What loading a file here actually changes:
- Trip History / Dashboard / Digital Twin switch to real reconstructed
  trips once real mobility data (`data/real/mobility/`) is also present.
- The "Current environment" reading on the Dashboard and Navigate pages
  starts using the nearest station's most recent reading instead of the
  synthetic model (still labelled "Historical Malaysian environmental
  data", never "live").
- Route Advisor / Navigate's road-segment exposure estimates use the
  nearest station's PM2.5/PM10/NO2 instead of the synthetic model for every
  OSRM route segment.

Every value derived from this pipeline carries explicit provenance
(station name, distance, interpolation method) — see
`lib/realDataEngine.ts` and the "Why this exposure?" panels in the UI.

See `lib/realDataAdapter.ts` for the loader and the root `README.md` for
the full three-mode (historical/live/synthetic) environmental data design.
