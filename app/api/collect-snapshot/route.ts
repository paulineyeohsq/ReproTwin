import { NextRequest, NextResponse } from "next/server";
import { collectSnapshot } from "@/lib/historicalCollector";

// Triggered externally on a schedule (see .github/workflows/collect-
// environment-data.yml) rather than by a Netlify Scheduled Function, so
// that a real cron history is visible/auditable in the GitHub repo itself
// and needs no additional Netlify-side configuration. If COLLECT_SECRET is
// set, requires it as a bearer token — left unset by default since this
// endpoint only ever appends a real fetched snapshot (never accepts
// caller-supplied data), so abuse risk is low, but the option exists for
// anyone who wants to lock it down.
export async function POST(req: NextRequest) {
  const secret = process.env.COLLECT_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await collectSnapshot();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
