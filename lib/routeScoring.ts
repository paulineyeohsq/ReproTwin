// Pure, dependency-free route scoring — deliberately kept in its own module
// (no fs-touching imports) so client components (e.g. RouteAdvisorClient)
// can import it directly without pulling lib/routeAdvisor.ts's server-only
// dependency chain (routeExposure.ts -> realDataEngine.ts/dataMode.ts,
// which read the filesystem) into the browser bundle.

import type { CandidateRoute } from "./types";

// Route predictions are simulated for the evening peak (typical of the
// rider's 17:00-20:00 commute window) so the numbers reflect realistic
// rush-hour conditions rather than an arbitrary time of day.
export const ADVISOR_HOUR = 18;

export type PreferenceKey = "fastest" | "balanced" | "lowest_exposure";

export const PREFERENCE_WEIGHTS: Record<
  PreferenceKey,
  { exposure: number; time: number; label: string }
> = {
  fastest: { exposure: 0.3, time: 0.7, label: "Fastest" },
  balanced: { exposure: 0.7, time: 0.3, label: "Balanced" },
  lowest_exposure: { exposure: 0.9, time: 0.1, label: "Lowest exposure" },
};

// Very simple weighted score — not a graph-search algorithm. Lower is
// better; the route with the lowest weighted cost is the AI-recommended one.
export function scoreRoutes(
  routes: CandidateRoute[],
  preference: PreferenceKey
): { route: CandidateRoute; score: number }[] {
  const weights = PREFERENCE_WEIGHTS[preference];
  const minExposure = Math.min(...routes.map((r) => r.predictedExposure));
  const maxExposure = Math.max(...routes.map((r) => r.predictedExposure));
  const minTime = Math.min(...routes.map((r) => r.travelTimeMin));
  const maxTime = Math.max(...routes.map((r) => r.travelTimeMin));

  const normalize = (v: number, min: number, max: number) =>
    max === min ? 0 : (v - min) / (max - min);

  return routes
    .map((route) => {
      const exposureScore = normalize(
        route.predictedExposure,
        minExposure,
        maxExposure
      );
      const timeScore = normalize(route.travelTimeMin, minTime, maxTime);
      const score = weights.exposure * exposureScore + weights.time * timeScore;
      return { route, score };
    })
    .sort((a, b) => a.score - b.score);
}
