import { TrafficDataMapClient } from "@/components/trafficdata/TrafficDataMapClient";
import { fetchNationwideTrafficSamples, isTrafficConfigured } from "@/lib/liveTraffic";

// Matches lib/liveTraffic.ts's own per-point cache window — traffic
// changes far faster than air quality, so this refreshes more often than
// the 5-minute window used on Air Quality / System Status.
export const revalidate = 120;

export default async function TrafficDataPage() {
  const configured = isTrafficConfigured();
  const samples = configured ? await fetchNationwideTrafficSamples() : [];

  return <TrafficDataMapClient samples={samples} configured={configured} />;
}
