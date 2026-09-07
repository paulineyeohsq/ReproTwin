import { RouteAdvisorClient } from "@/components/route-advisor/RouteAdvisorClient";
import { getCandidateRoutesAsync } from "@/lib/routeAdvisor";
import { MAP_CENTER, ORIGIN_LABEL, POPULAR_DESTINATIONS, DESTINATIONS } from "@/lib/constants";

// Origin and destination are now freely searchable (see RouteAdvisorClient),
// so this only prefetches one sensible default pair server-side for a fast
// initial paint — any subsequent search re-fetches client-side via
// /api/routes, the same endpoint the Home/Navigate flow uses.
export default async function RouteAdvisorPage() {
  const origin = { label: ORIGIN_LABEL, lat: MAP_CENTER[0], lng: MAP_CENTER[1] };
  const defaultDestination = POPULAR_DESTINATIONS.find((d) => d.label === DESTINATIONS[0])!;
  const destination = { label: defaultDestination.label, lat: defaultDestination.lat, lng: defaultDestination.lng };

  const result = await getCandidateRoutesAsync(
    { lat: origin.lat, lng: origin.lng },
    { lat: destination.lat, lng: destination.lng },
    destination.label
  );

  return (
    <RouteAdvisorClient
      initialOrigin={origin}
      initialDestination={destination}
      initialRoutes={result.routes}
      initialUsedRealRoads={result.usedRealRoads}
    />
  );
}
