import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getCandidateRoutesAsync, scoreRoutes } from "@/lib/routeAdvisor";
import { ORIGIN_LABEL, MAP_CENTER } from "@/lib/constants";
import { Sparkles, ArrowRight } from "lucide-react";

// Real road routing (OSRM) + real environmental data (live nationwide
// stations / historical CSV, whichever is configured) — the same pipeline
// /navigate and /route-advisor use, via getCandidateRoutesAsync. Falls back
// to the procedural synthetic demo routes only if OSRM itself is entirely
// unreachable, same as everywhere else in the app.
export async function RouteRecommendationPreview({
  destination,
}: {
  destination: { label: string; lat: number; lng: number };
}) {
  const { routes: candidates } = await getCandidateRoutesAsync(
    { lat: MAP_CENTER[0], lng: MAP_CENTER[1] },
    { lat: destination.lat, lng: destination.lng },
    destination.label
  );
  const fastest = candidates.find((c) => c.profile === "fastest")!;
  const recommended = scoreRoutes(candidates, "balanced")[0].route;
  const reductionPct = Math.round(
    ((fastest.predictedExposure - recommended.predictedExposure) / fastest.predictedExposure) * 100
  );
  const timeDelta = recommended.travelTimeMin - fastest.travelTimeMin;

  return (
    <Card>
      <CardHeader
        title="Route recommendation"
        subtitle={`${ORIGIN_LABEL} → ${destination.label}`}
      />
      <CardBody className="space-y-3">
        {reductionPct > 0 ? (
          <Badge className="border-[var(--brand)]/30 bg-[var(--brand)]/10 text-[var(--brand-dark)]">
            <Sparkles className="h-3 w-3" /> Lower-exposure route available
          </Badge>
        ) : (
          <Badge className="border-slate-200 bg-slate-50 text-slate-600">
            Fastest route is already lowest-exposure
          </Badge>
        )}

        <div className="flex items-center gap-3 text-sm">
          <div className="flex-1 rounded-lg border border-slate-200 p-2.5">
            <div className="text-xs font-medium text-slate-400">Route A</div>
            <div className="font-semibold text-slate-800">{fastest.travelTimeMin} min</div>
            <div className="text-xs text-slate-500">{fastest.label} route</div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
          <div className="flex-1 rounded-lg border border-[var(--brand)]/40 bg-[var(--brand)]/5 p-2.5">
            <div className="text-xs font-medium text-[var(--brand-dark)]">Route B</div>
            <div className="font-semibold text-slate-800">{recommended.travelTimeMin} min</div>
            <div className="text-xs text-slate-500">{recommended.label} route</div>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">Recommended: Route B.</span>{" "}
          {reductionPct > 0
            ? `${reductionPct}% lower predicted exposure for approximately ${Math.max(0, timeDelta)} additional minute${timeDelta === 1 ? "" : "s"} of travel.`
            : "Comparable predicted exposure to the fastest route."}
        </p>

        <Link href="/route-advisor">
          <Button size="sm" variant="outline">
            Compare all routes
          </Button>
        </Link>
      </CardBody>
    </Card>
  );
}
