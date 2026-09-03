import { ExposureMapClient } from "@/components/exposuremap/ExposureMapClient";
import { getHotspots, getDataProvenance } from "@/lib/dataAccess";
import { getCurrentEnvironmentalReading } from "@/lib/environmentalDataProvider";
import { fetchWaqiHistoricalAverage, isLiveEnvironmentConfigured, type WaqiHistoricalAverage } from "@/lib/liveEnvironment";
import type { EnvironmentalReading } from "@/lib/types";

// See app/page.tsx for why this is needed on a statically-optimized build
// — the per-hotspot live readings below must not freeze at build time.
export const revalidate = 300;

export default async function ExposureMapPage() {
  const hotspots = getHotspots();
  const provenance = getDataProvenance();

  // The hotspot list's own historical average stays visit-weighted from
  // recorded trips (an exposure statistic tied to when the rider actually
  // rode there) — that doesn't change just because a live source is
  // configured. What CAN come from WAQI is a genuine recent-days station
  // average for that exact spot, shown alongside it, clearly labelled.
  const liveEntries = await Promise.all(
    hotspots.map(async (h) => [h.id, await getCurrentEnvironmentalReading(h.latitude, h.longitude)] as const)
  );
  const liveReadings: Record<string, EnvironmentalReading> = Object.fromEntries(liveEntries);

  let waqiHistoricals: Record<string, WaqiHistoricalAverage> = {};
  if (isLiveEnvironmentConfigured()) {
    const entries = await Promise.all(
      hotspots.map(async (h) => [h.id, await fetchWaqiHistoricalAverage(h.latitude, h.longitude)] as const)
    );
    waqiHistoricals = Object.fromEntries(entries.filter((e): e is [string, WaqiHistoricalAverage] => e[1] !== null));
  }

  return (
    <ExposureMapClient
      hotspots={hotspots}
      provenance={provenance}
      liveReadings={liveReadings}
      waqiHistoricals={waqiHistoricals}
    />
  );
}
