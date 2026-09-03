import { NextResponse } from "next/server";
import { geocodeDestination } from "@/lib/geocode";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const startedAt = Date.now();
  const results = await geocodeDestination(q);
  const latencyMs = Date.now() - startedAt;
  return NextResponse.json({ results, latencyMs });
}
