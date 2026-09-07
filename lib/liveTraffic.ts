// OPTIONAL live road-traffic source, mirroring lib/liveEnvironment.ts's
// WAQI pattern: an explicitly optional, off-by-default integration
// (TOMTOM_API_KEY) that replaces the synthetic hour/road-type traffic
// inference in lib/environment.ts with TomTom's real current-vs-free-flow
// speed data ("Flow Segment Data"), wherever it's configured and the
// request succeeds.
//
// TomTom's free tier (2,500 requests/day, no credit card required to
// register — https://developer.tomtom.com) has no bulk "every segment in a
// bounding box" endpoint the way WAQI's map/bounds does — Flow Segment Data
// is queried one point at a time. To keep a single route-comparison
// request (up to 4 candidate routes, each with dozens of raw OSRM
// segments) within a sane request budget, callers sample a small, bounded
// number of points per route (sampleRoutePoints) rather than querying
// every segment — the same "average of the area passed through" approach
// already used for live PM2.5, applied here to traffic.
//
// Terms to respect if this is used beyond local research/demo use: TomTom's
// free/developer tier is for evaluation and low-volume use, requires
// attribution ("Traffic data (c) TomTom") wherever a reading derived from
// it is shown, and its terms prohibit redistributing raw responses — this
// module only ever derives the small trafficLevel/speed figures actually
// used for one route request and never persists a raw response. Confirm
// current terms at https://developer.tomtom.com/store/legal before
// production use.

import { haversineKm } from "./geo";
import type { LatLng } from "./routingEngine";
import type { TrafficLevel } from "./types";

const TOMTOM_FLOW_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json";

export function isTrafficConfigured(): boolean {
  return Boolean(process.env.TOMTOM_API_KEY);
}

export const LIVE_TRAFFIC_SOURCE = "Real-time traffic flow via TomTom Traffic API";

export interface LiveTrafficSample {
  lat: number;
  lng: number;
  trafficLevel: TrafficLevel;
  ratio: number; // currentSpeed / freeFlowSpeed — <1 slower than typical, ~1 near free-flow
  currentSpeedKmh: number;
  freeFlowSpeedKmh: number;
}

// currentSpeed/freeFlowSpeed ratio -> the same three-level TrafficLevel the
// synthetic model already uses, so live and synthetic readings feed the
// exposure model identically.
function classifyRatio(ratio: number): TrafficLevel {
  if (ratio >= 0.75) return "low";
  if (ratio >= 0.45) return "moderate";
  return "heavy";
}

async function fetchOnePoint(lat: number, lng: number, key: string): Promise<LiveTrafficSample | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    // Traffic changes far faster than air quality — a much shorter cache
    // window than WAQI's 5 minutes.
    const res = await fetch(`${TOMTOM_FLOW_URL}?point=${lat},${lng}&key=${key}`, {
      signal: controller.signal,
      next: { revalidate: 120 },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    const seg = json.flowSegmentData;
    if (!seg || typeof seg.currentSpeed !== "number" || typeof seg.freeFlowSpeed !== "number" || seg.freeFlowSpeed <= 0) {
      return null;
    }
    const ratio = seg.currentSpeed / seg.freeFlowSpeed;
    return {
      lat,
      lng,
      trafficLevel: classifyRatio(ratio),
      ratio,
      currentSpeedKmh: seg.currentSpeed,
      freeFlowSpeedKmh: seg.freeFlowSpeed,
    };
  } catch {
    return null; // network failure/timeout/rate-limit — fall through, never fabricate
  }
}

// Evenly spaced points along a route's real geometry — bounded regardless
// of how many raw OSRM segments the route actually has, since Flow Segment
// Data has no bulk endpoint (see module comment).
export function sampleRoutePoints(coordinates: LatLng[], maxSamples: number): LatLng[] {
  if (coordinates.length <= maxSamples) return coordinates;
  const step = (coordinates.length - 1) / (maxSamples - 1);
  const points: LatLng[] = [];
  for (let i = 0; i < maxSamples; i++) {
    points.push(coordinates[Math.round(i * step)]);
  }
  return points;
}

const MAX_SAMPLES_PER_ROUTE = 5;

// Fetches live traffic for a bounded set of points along one route. Never
// throws and never fabricates: points whose fetch fails are simply
// dropped, so a caller with zero successful samples falls back entirely to
// the synthetic traffic model rather than mixing a fabricated reading in.
export async function fetchLiveTrafficForRoute(coordinates: LatLng[]): Promise<LiveTrafficSample[]> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return [];
  const points = sampleRoutePoints(coordinates, MAX_SAMPLES_PER_ROUTE);
  const results = await Promise.all(points.map((p) => fetchOnePoint(p.lat, p.lng, key)));
  return results.filter((r): r is LiveTrafficSample => r !== null);
}

export function nearestTrafficSample(lat: number, lng: number, samples: LiveTrafficSample[]): LiveTrafficSample | null {
  let best: LiveTrafficSample | null = null;
  let bestDistanceKm = Infinity;
  for (const s of samples) {
    const d = haversineKm({ lat, lng }, { lat: s.lat, lng: s.lng });
    if (d < bestDistanceKm) {
      bestDistanceKm = d;
      best = s;
    }
  }
  return best;
}

// A route-level average of the same live samples, used to adjust the
// route's displayed/ranked travel time toward real current conditions —
// OSRM's public "driving" profile returns a static, roughly free-flow
// duration with no live congestion awareness at all.
export function averageTrafficRatio(samples: LiveTrafficSample[]): number | null {
  if (samples.length === 0) return null;
  return samples.reduce((sum, s) => sum + s.ratio, 0) / samples.length;
}

// Fixed, curated city-centre points (state capitals + major cities) used
// for a nationwide traffic snapshot — unlike WAQI, TomTom's Flow Segment
// Data has no bulk/station-list endpoint at all, only per-point queries,
// so there is no way to discover "every sensor" the way
// fetchMalaysiaStations does. A blind lat/lng grid (as used for WAQI)
// would mostly land on open countryside or sea with no road at all, so
// these points are chosen to actually sit on real, busy roads.
export const TRAFFIC_SAMPLE_POINTS: { label: string; lat: number; lng: number }[] = [
  { label: "Petaling Jaya", lat: 3.1073, lng: 101.6067 },
  { label: "Kuala Lumpur", lat: 3.139, lng: 101.6869 },
  { label: "Shah Alam", lat: 3.0733, lng: 101.5185 },
  { label: "Subang Jaya", lat: 3.0567, lng: 101.5851 },
  { label: "Klang", lat: 3.0449, lng: 101.4455 },
  { label: "Putrajaya", lat: 2.9264, lng: 101.6964 },
  { label: "Seremban", lat: 2.7297, lng: 101.9381 },
  { label: "Malacca City", lat: 2.1896, lng: 102.2501 },
  { label: "Johor Bahru", lat: 1.4927, lng: 103.7414 },
  { label: "Ipoh", lat: 4.5975, lng: 101.0901 },
  { label: "George Town, Penang", lat: 5.4141, lng: 100.3288 },
  { label: "Alor Setar", lat: 6.1184, lng: 100.3685 },
  { label: "Kangar", lat: 6.4414, lng: 100.1986 },
  { label: "Kota Bharu", lat: 6.1254, lng: 102.2381 },
  { label: "Kuala Terengganu", lat: 5.3117, lng: 103.1324 },
  { label: "Kuantan", lat: 3.8077, lng: 103.326 },
  { label: "Kota Kinabalu", lat: 5.9804, lng: 116.0735 },
  { label: "Kuching", lat: 1.5533, lng: 110.3592 },
  { label: "Miri", lat: 4.3993, lng: 113.9914 },
  { label: "Sandakan", lat: 5.8402, lng: 118.1179 },
];

export interface TrafficSamplePoint extends LiveTrafficSample {
  label: string;
}

// A nationwide traffic snapshot for the Traffic Data page — fetches all
// curated points in parallel. Never fabricates: a point whose fetch fails
// (no key, timeout, no road at that exact coordinate) is simply dropped,
// same failure handling as fetchLiveTrafficForRoute.
export async function fetchNationwideTrafficSamples(): Promise<TrafficSamplePoint[]> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return [];
  const results = await Promise.all(
    TRAFFIC_SAMPLE_POINTS.map(async (p) => {
      const sample = await fetchOnePoint(p.lat, p.lng, key);
      return sample ? { ...sample, label: p.label } : null;
    })
  );
  return results.filter((r): r is TrafficSamplePoint => r !== null);
}
