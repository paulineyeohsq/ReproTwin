import { NextRequest, NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/geocode";

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng query params are required" }, { status: 400 });
  }

  const label = await reverseGeocode(lat, lng);
  return NextResponse.json({ label });
}
