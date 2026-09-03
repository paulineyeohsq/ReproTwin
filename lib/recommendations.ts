import type { RiderProfile } from "./types";

export interface Recommendation {
  id: string;
  title: string;
  text: string;
}

export interface RecommendationInputs {
  minLowExposureDetourMin: number; // smallest (low-exposure - fastest) travel time delta across destinations
  bestRouteExposureReductionPct: number; // % lower exposure for that same route pair
  peakHourExposureRatio: number; // avg exposure during 07-09/17-20 vs off-peak
  exposureTrend: "Increasing" | "Stable" | "Decreasing";
  ninetyDayLevel: "Low" | "Moderate" | "High";
  recentAvgSleep: number;
  historicalAvgSleep: number;
}

// Simple deterministic exposure-management recommendations — not medical or
// fertility advice.
export function getRecommendations(inputs: RecommendationInputs): Recommendation[] {
  const recs: Recommendation[] = [];

  if (inputs.minLowExposureDetourMin < 10) {
    recs.push({
      id: "low-exposure-route",
      title: "Route choice",
      text: `Consider the lower-exposure route: predicted exposure is around ${Math.max(
        1,
        Math.round(inputs.bestRouteExposureReductionPct)
      )}% lower for about ${Math.round(inputs.minLowExposureDetourMin)} additional minutes of travel.`,
    });
  }

  if (inputs.peakHourExposureRatio > 1.15) {
    recs.push({
      id: "peak-hour-pattern",
      title: "Travel timing",
      text: "Peak-hour travel is associated with higher predicted exposure in your recent trips. Consider comparing alternative travel times where practical.",
    });
  }

  if (inputs.exposureTrend === "Increasing") {
    recs.push({
      id: "cumulative-trend",
      title: "Cumulative exposure",
      text: "Your cumulative exposure has been higher than your 30-day baseline. Consider lower-exposure routes where practical.",
    });
  }

  if (inputs.ninetyDayLevel === "High") {
    recs.push({
      id: "high-exposure-segments",
      title: "Route segments",
      text: "Consider reducing time spent on high-exposure road segments when alternative routes are available.",
    });
  }

  if (inputs.recentAvgSleep < inputs.historicalAvgSleep - 0.3) {
    recs.push({
      id: "sleep-recovery",
      title: "Recovery",
      text: "Your recent sleep duration is lower than your historical average. Consider reviewing your schedule and recovery time.",
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: "steady-state",
      title: "Steady state",
      text: "Your recent exposure and recovery patterns are broadly consistent with your historical baseline.",
    });
  }

  return recs;
}

// Recommendations derived from the rider's own profile — makes the same
// exposure-management guidance more personalised. Not medical or fertility
// advice.
export function getProfileRecommendations(profile: RiderProfile): Recommendation[] {
  const recs: Recommendation[] = [];

  if (profile.average_riding_hours >= 3.2) {
    recs.push({
      id: "profile-high-riding-hours",
      title: "Riding duration",
      text: "Your relatively high daily riding duration contributes substantially to cumulative exposure. Lower-exposure routes may provide greater potential exposure reduction over time.",
    });
  }

  const period = profile.typical_travel_period.toLowerCase();
  const overlapsPeak =
    /7|8|9\s*am/.test(period) || /5|6|7|8\s*pm/.test(period) || period.includes("peak");
  if (overlapsPeak) {
    recs.push({
      id: "profile-peak-travel",
      title: "Travel timing",
      text: "Your usual travel periods overlap with higher-traffic periods. Consider comparing alternative travel times or routes when practical.",
    });
  }

  if (profile.riding_days_per_week >= 6) {
    recs.push({
      id: "profile-frequent-use",
      title: "Riding frequency",
      text: "Because you ride frequently, small reductions in exposure per trip may accumulate into a meaningful difference over the 30–90 day period.",
    });
  }

  return recs;
}
