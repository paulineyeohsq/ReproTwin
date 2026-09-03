import type { RoadType, RouteWaypointDef } from "./types";

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeDistanceKm(waypoints: RouteWaypointDef[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += haversineKm(waypoints[i - 1], waypoints[i]);
  }
  return total;
}

// Resample a polyline (defined by waypoints with road types on each segment)
// into `count` evenly-spaced points, each carrying the road type of the
// segment it falls within, and a cumulative distance for timing purposes.
export interface ResampledPoint {
  lat: number;
  lng: number;
  roadType: RoadType;
  cumulativeKm: number;
}

export function resampleRoute(
  waypoints: RouteWaypointDef[],
  count: number
): ResampledPoint[] {
  if (waypoints.length < 2) {
    return waypoints.map((w) => ({ ...w, cumulativeKm: 0 }));
  }

  const segLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const d = haversineKm(waypoints[i - 1], waypoints[i]);
    segLengths.push(d);
    total += d;
  }

  const out: ResampledPoint[] = [];
  for (let i = 0; i < count; i++) {
    const targetDist = (total * i) / (count - 1);
    let acc = 0;
    let segIdx = 0;
    while (
      segIdx < segLengths.length - 1 &&
      acc + segLengths[segIdx] < targetDist
    ) {
      acc += segLengths[segIdx];
      segIdx++;
    }
    const segStart = waypoints[segIdx];
    const segEnd = waypoints[segIdx + 1] ?? waypoints[segIdx];
    const segLen = segLengths[segIdx] || 1e-6;
    const frac = Math.min(1, Math.max(0, (targetDist - acc) / segLen));
    out.push({
      lat: segStart.lat + (segEnd.lat - segStart.lat) * frac,
      lng: segStart.lng + (segEnd.lng - segStart.lng) * frac,
      roadType: segStart.roadType,
      cumulativeKm: targetDist,
    });
  }
  return out;
}
