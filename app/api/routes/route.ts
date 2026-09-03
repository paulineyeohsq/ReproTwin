import { NextResponse } from "next/server";
import { getCandidateRoutesAsync } from "@/lib/routeAdvisor";

// Server-side route handler so the Navigate page (client component) can
// request real road-following candidate routes for an arbitrary geocoded
// destination without needing its own CORS-exposed OSRM calls. Keeps the
// OSRM fetch on the server, where Next.js can also cache repeated
// origin/destination requests.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { originLat, originLng, destLat, destLng, destLabel, hour } = body ?? {};

  if (
    typeof originLat !== "number" ||
    typeof originLng !== "number" ||
    typeof destLat !== "number" ||
    typeof destLng !== "number" ||
    typeof destLabel !== "string"
  ) {
    return NextResponse.json({ error: "Missing or invalid origin/destination" }, { status: 400 });
  }

  const startedAt = Date.now();
  const result = await getCandidateRoutesAsync(
    { lat: originLat, lng: originLng },
    { lat: destLat, lng: destLng },
    destLabel,
    typeof hour === "number" ? hour : undefined
  );
  const latencyMs = Date.now() - startedAt;

  return NextResponse.json({ ...result, latencyMs });
}
