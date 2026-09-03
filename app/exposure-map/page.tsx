import { ExposureMapClient } from "@/components/exposuremap/ExposureMapClient";
import { getHotspots, getDataProvenance } from "@/lib/dataAccess";
import { getCurrentEnvironmentalReading } from "@/lib/environmentalDataProvider";
import type { EnvironmentalReading } from "@/lib/types";

// See app/page.tsx for why this is needed on a statically-optimized build
// — the per-hotspot live readings below must not freeze at build time.
export const revalidate = 300;

export default async function ExposureMapPage() {
  const hotspots = getHotspots();
  const provenance = getDataProvenance();

  // The hotspot list itself is historical (visit-weighted averages from
  // recorded trips) — that doesn't change just because a live source is
  // configured. What CAN be live is "what's the reading at this same spot
  // right now", so we fetch that separately, per hotspot, and show both.
  const liveEntries = await Promise.all(
    hotspots.map(async (h) => [h.id, await getCurrentEnvironmentalReading(h.latitude, h.longitude)] as const)
  );
  const liveReadings: Record<string, EnvironmentalReading> = Object.fromEntries(liveEntries);

  return <ExposureMapClient hotspots={hotspots} provenance={provenance} liveReadings={liveReadings} />;
}
