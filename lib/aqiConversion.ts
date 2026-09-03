// Converts a US EPA Air Quality Index value back to an estimated PM2.5
// concentration (µg/m³), by inverting the same public breakpoint formula
// the EPA (and WAQI, which reports this AQI scale) uses to compute AQI
// from a real measurement in the first place. This is a real, standard,
// documented conversion — not an invented one — used here because
// lib/historicalCollector.ts's snapshots store the composite AQI (the only
// figure WAQI's bulk map/bounds endpoint returns for many stations in one
// call), while lib/historicalOpenDosm.ts's real national baseline is in
// PM2.5 µg/m³ directly. Combining the two requires both in the same unit.
//
// Breakpoints: EPA PM2.5 AQI table (24-hour average), the long-standing
// pre-2024 revision — https://www.airnow.gov/aqi/aqi-basics/
const BREAKPOINTS = [
  { aqiLow: 0, aqiHigh: 50, concLow: 0.0, concHigh: 12.0 },
  { aqiLow: 51, aqiHigh: 100, concLow: 12.1, concHigh: 35.4 },
  { aqiLow: 101, aqiHigh: 150, concLow: 35.5, concHigh: 55.4 },
  { aqiLow: 151, aqiHigh: 200, concLow: 55.5, concHigh: 150.4 },
  { aqiLow: 201, aqiHigh: 300, concLow: 150.5, concHigh: 250.4 },
  { aqiLow: 301, aqiHigh: 400, concLow: 250.5, concHigh: 350.4 },
  { aqiLow: 401, aqiHigh: 500, concLow: 350.5, concHigh: 500.4 },
] as const;

export function aqiToPm25(aqi: number): number {
  const bp = BREAKPOINTS.find((b) => aqi >= b.aqiLow && aqi <= b.aqiHigh) ?? BREAKPOINTS[BREAKPOINTS.length - 1];
  const pm25 = ((aqi - bp.aqiLow) * (bp.concHigh - bp.concLow)) / (bp.aqiHigh - bp.aqiLow) + bp.concLow;
  return Math.round(pm25 * 10) / 10;
}
