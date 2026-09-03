import { TripHistoryClient } from "@/components/trip-history/TripHistoryClient";
import { getTripHistorySummaries, getDataProvenance, getRealStations } from "@/lib/dataAccess";

export default function TripHistoryPage() {
  const trips = getTripHistorySummaries(20);
  const provenance = getDataProvenance();
  const stations = getRealStations();

  return <TripHistoryClient trips={trips} provenance={provenance} stations={stations} />;
}
