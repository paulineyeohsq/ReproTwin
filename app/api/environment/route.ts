import { NextRequest, NextResponse } from "next/server";
import { getCurrentEnvironmentalReading } from "@/lib/environmentalDataProvider";

// Server-side proxy so the client never needs (or can see) WAQI_TOKEN, and
// so a "current conditions" lookup can be re-run for the rider's actual
// live GPS position at ride start, not just the fixed demo origin used for
// the page's initial server-rendered reading.
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng query params are required" }, { status: 400 });
  }

  const start = Date.now();
  const reading = await getCurrentEnvironmentalReading(lat, lng);
  return NextResponse.json({ reading, latencyMs: Date.now() - start });
}
