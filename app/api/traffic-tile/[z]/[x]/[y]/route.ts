import { NextResponse } from "next/server";

// Proxies TomTom's live traffic Flow Tiles so TOMTOM_API_KEY never reaches
// the browser. Unlike lib/liveTraffic.ts's point samples (one Flow Segment
// Data reading per fixed city), this streams the actual per-road colour-
// coded tile images (green/amber/red by current-vs-free-flow speed) that a
// Leaflet TileLayer renders directly on the map — see
// components/trafficdata/TrafficDataMapClient.tsx.
const TOMTOM_TILE_BASE = "https://api.tomtom.com/traffic/map/4/tile/flow/relative0";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) {
    return new NextResponse(null, { status: 404 });
  }

  const { z, x, y } = await params;
  if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const res = await fetch(`${TOMTOM_TILE_BASE}/${z}/${x}/${y}.png?key=${key}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return new NextResponse(null, { status: res.status });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        // Traffic changes fast, but a short cache still meaningfully cuts
        // repeat TomTom requests when several viewers overlap the same
        // tile within a couple of minutes.
        "Cache-Control": "public, max-age=120, s-maxage=120",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
