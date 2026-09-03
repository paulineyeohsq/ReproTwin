import { RouteAdvisorClient } from "@/components/route-advisor/RouteAdvisorClient";
import { getDataProvenance } from "@/lib/dataAccess";
import { getCandidateRoutesAsync } from "@/lib/routeAdvisor";
import { BASE_ROUTES } from "@/lib/baseRoutes";
import { DESTINATIONS } from "@/lib/constants";
import type { CandidateRoute } from "@/lib/types";

export default async function RouteAdvisorPage() {
  const provenance = getDataProvenance();

  const entries = await Promise.all(
    DESTINATIONS.map(async (destinationLabel) => {
      const base = BASE_ROUTES.find((b) => b.destination === destinationLabel)!;
      const origin = base.waypoints[0];
      const destination = base.waypoints[base.waypoints.length - 1];
      const result = await getCandidateRoutesAsync(origin, destination, destinationLabel);
      return [destinationLabel, result] as const;
    })
  );

  const candidatesByDestination: Record<
    string,
    { routes: CandidateRoute[]; usedRealRoads: boolean }
  > = Object.fromEntries(entries);

  return (
    <RouteAdvisorClient provenance={provenance} candidatesByDestination={candidatesByDestination} />
  );
}
