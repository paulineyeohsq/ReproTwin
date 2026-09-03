import { AirQualityMapClient } from "@/components/airquality/AirQualityMapClient";
import { fetchMalaysiaStations, isLiveEnvironmentConfigured } from "@/lib/liveEnvironment";

// See app/page.tsx for why this is needed on a statically-optimized build
// — this page shows live nationwide readings that must not freeze at
// build time.
export const revalidate = 300;

export default async function AirQualityPage() {
  const configured = isLiveEnvironmentConfigured();
  const stations = configured ? await fetchMalaysiaStations() : [];

  return <AirQualityMapClient stations={stations} configured={configured} />;
}
