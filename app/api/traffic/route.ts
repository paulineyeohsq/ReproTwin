import { NextRequest, NextResponse } from "next/server";
import { fetchLiveTrafficForRoute, isTrafficConfigured, LIVE_TRAFFIC_SOURCE } from "@/lib/liveTraffic";
import { inferTrafficLevel } from "@/lib/environment";
import { mulberry32, hashStringToSeed } from "@/lib/rng";
import type { RoadType, PointTrafficReading } from "@/lib/types";

const SYNTHETIC_TRAFFIC_SOURCE = "Prototype synthetic traffic model";

// Server-side proxy so TOMTOM_API_KEY never reaches the client — same
// tiered real-then-synthetic pattern as /api/environment (see
// lib/environmentalDataProvider.ts), but for one point's live traffic
// congestion. Reuses fetchLiveTrafficForRoute with a single-point array
// rather than duplicating its TomTom request logic.
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const hourParam = Number(req.nextUrl.searchParams.get("hour"));
  const roadType = (req.nextUrl.searchParams.get("roadType") as RoadType | null) ?? "arterial";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng query params are required" }, { status: 400 });
  }
  const hour = Number.isFinite(hourParam) ? hourParam : new Date().getHours();

  if (isTrafficConfigured()) {
    const [sample] = await fetchLiveTrafficForRoute([{ lat, lng }]);
    if (sample) {
      const reading: PointTrafficReading = {
        trafficLevel: sample.trafficLevel,
        mode: "live",
        source: LIVE_TRAFFIC_SOURCE,
        currentSpeedKmh: sample.currentSpeedKmh,
        freeFlowSpeedKmh: sample.freeFlowSpeedKmh,
      };
      return NextResponse.json(reading);
    }
    // Key configured but this point's request failed (network/rate-limit/
    // no road at this exact coordinate) — fall through to synthetic.
  }

  // 2-minute buckets so repeated polls of the same point within a short
  // window return a stable value instead of a fresh random draw each time.
  const rng = mulberry32(hashStringToSeed(`traffic-${lat.toFixed(4)}-${lng.toFixed(4)}-${Math.floor(Date.now() / 120000)}`));
  const trafficLevel = inferTrafficLevel(hour, roadType, rng);
  const reading: PointTrafficReading = { trafficLevel, mode: "synthetic", source: SYNTHETIC_TRAFFIC_SOURCE };
  return NextResponse.json(reading);
}
