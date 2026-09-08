import type { RoadType, RouteWaypointDef } from "./types";

export interface LatLngLike {
  lat: number;
  lng: number;
}

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

// Resamples a raw lat/lng polyline (no road-type metadata, unlike
// ResampledPoint above) into `count` evenly-spaced points along its length
// — used to compare two routes' shapes point-for-point regardless of how
// many raw coordinates each one has.
export function resamplePolyline(coords: LatLngLike[], count: number): LatLngLike[] {
  if (coords.length === 0) return [];
  if (coords.length === 1 || count <= 1) return [coords[0]];

  const segLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversineKm(coords[i - 1], coords[i]);
    segLengths.push(d);
    total += d;
  }

  const out: LatLngLike[] = [];
  for (let i = 0; i < count; i++) {
    const targetDist = (total * i) / (count - 1);
    let acc = 0;
    let segIdx = 0;
    while (segIdx < segLengths.length - 1 && acc + segLengths[segIdx] < targetDist) {
      acc += segLengths[segIdx];
      segIdx++;
    }
    const segStart = coords[segIdx];
    const segEnd = coords[segIdx + 1] ?? coords[segIdx];
    const segLen = segLengths[segIdx] || 1e-6;
    const frac = Math.min(1, Math.max(0, (targetDist - acc) / segLen));
    out.push({
      lat: segStart.lat + (segEnd.lat - segStart.lat) * frac,
      lng: segStart.lng + (segEnd.lng - segStart.lng) * frac,
    });
  }
  return out;
}

// The largest point-for-point gap between two routes' shapes, sampled at
// evenly-spaced fractions of each route's own length — used to tell a
// genuinely different real road path apart from a via-point detour that
// simply rejoins the same road almost immediately (which would otherwise
// look like a "different" route while being ~identical in practice).
export function maxSeparationKm(a: LatLngLike[], b: LatLngLike[], samples = 12): number {
  const ra = resamplePolyline(a, samples);
  const rb = resamplePolyline(b, samples);
  let max = 0;
  for (let i = 0; i < Math.min(ra.length, rb.length); i++) {
    max = Math.max(max, haversineKm(ra[i], rb[i]));
  }
  return max;
}
