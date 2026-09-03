"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { EnvironmentalModeBadge } from "@/components/ui/EnvironmentalModeBadge";
import { ExposureProvenance } from "@/components/ui/ExposureProvenance";
import { LeafletMap } from "@/components/map/LeafletMap";
import type { MapPolyline } from "@/components/map/LeafletMapInner";
import { DESTINATIONS, ORIGIN_LABEL, MAP_CENTER } from "@/lib/constants";
import { scoreRoutes, ADVISOR_HOUR, PREFERENCE_WEIGHTS, type PreferenceKey } from "@/lib/routeScoring";
import { getModelMetrics } from "@/lib/aiModel";
import { cn } from "@/lib/cn";
import { Sparkles, Clock, Wind, Route as RouteIcon, Info, Map as MapIcon } from "lucide-react";
import type { RouteProfile, CandidateRoute } from "@/lib/types";

const PROFILE_COLORS: Record<RouteProfile, string> = {
  fastest: "#64748b",
  balanced: "#2563eb",
  low_exposure: "#0e6e63",
};

const EXPOSURE_LEVEL_HEX: Record<string, string> = {
  Low: "#059669",
  Moderate: "#d97706",
  High: "#e11d48",
};

const PREFERENCES: PreferenceKey[] = ["fastest", "balanced", "lowest_exposure"];

// Exposure level shown per candidate, relative to the other routes offered
// for this trip (rather than an absolute threshold) — mirrors how a rider
// would read "High / Medium / Low" across a short route comparison.
function relativeExposureLabel(
  candidates: { predictedExposure: number }[],
  value: number
): "Low" | "Medium" | "High" {
  const sorted = [...candidates].sort((a, b) => a.predictedExposure - b.predictedExposure);
  if (sorted.length < 3) return "Medium";
  if (value <= sorted[0].predictedExposure) return "Low";
  if (value >= sorted[sorted.length - 1].predictedExposure) return "High";
  return "Medium";
}

// Turns a route's per-segment exposure detail into a chain of tiny coloured
// polylines, so the map shows *which parts* of the journey drive exposure
// rather than one flat colour for the whole route.
function segmentPolylines(route: CandidateRoute, weight: number, opacity: number): MapPolyline[] {
  const geometry = route.geometry;
  const segs = route.segments;
  if (!geometry || !segs || segs.length === 0) {
    return [
      {
        id: route.id,
        positions: (geometry ?? route.waypoints).map((w) => [w.lat, w.lng] as [number, number]),
        color: PROFILE_COLORS[route.profile],
        weight,
        opacity,
      },
    ];
  }
  // segs[i] corresponds to the edge between geometry[i] and geometry[i+1].
  return segs.map((s, i) => ({
    id: `${route.id}-seg${i}`,
    positions: [
      [geometry[i].lat, geometry[i].lng],
      [geometry[i + 1]?.lat ?? geometry[i].lat, geometry[i + 1]?.lng ?? geometry[i].lng],
    ] as [number, number][],
    color: EXPOSURE_LEVEL_HEX[s.exposureLevel] ?? PROFILE_COLORS[route.profile],
    weight,
    opacity,
  }));
}

export function RouteAdvisorClient({
  candidatesByDestination,
}: {
  candidatesByDestination: Record<string, { routes: CandidateRoute[]; usedRealRoads: boolean }>;
}) {
  const [destination, setDestination] = useState<(typeof DESTINATIONS)[number]>(
    DESTINATIONS[0]
  );
  const [preference, setPreference] = useState<PreferenceKey>("balanced");
  const [selectedProfile, setSelectedProfile] = useState<RouteProfile | null>(null);
  const [showExposureColouring, setShowExposureColouring] = useState(true);

  const { routes: candidates, usedRealRoads } = candidatesByDestination[destination] ?? {
    routes: [],
    usedRealRoads: false,
  };

  const ranked = useMemo(
    () => (candidates.length ? scoreRoutes(candidates, preference) : []),
    [candidates, preference]
  );
  const recommended = ranked[0]?.route;
  const fastest = candidates.find((c) => c.profile === "fastest");
  const metrics = getModelMetrics();

  if (!recommended || !fastest) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Motorcycle Route Advisor</h1>
        <p className="text-sm text-rose-600">
          No route could be generated for this destination (both the live routing service and the
          demonstration fallback failed). Try again shortly.
        </p>
      </div>
    );
  }

  const exposureDelta = Math.round(
    ((fastest.predictedExposure - recommended.predictedExposure) /
      fastest.predictedExposure) *
      100
  );
  const timeDelta = recommended.travelTimeMin - fastest.travelTimeMin;

  const activeProfile = selectedProfile ?? recommended.profile;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Motorcycle Route Advisor
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Compare candidate motorcycle routes from {ORIGIN_LABEL} and let the
            trained exposure model recommend a balance of travel time and
            predicted pollution exposure — not simply the shortest route.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <SourceBadge source={recommended.roadNetworkSource} />
          <EnvironmentalModeBadge mode={recommended.environmentalMode} />
        </div>
      </div>

      {!usedRealRoads && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The live OpenStreetMap routing service (OSRM) was unreachable, so
          these routes use the prototype's demonstration road network instead
          of real road geometry for this destination.
        </p>
      )}

      <Card>
        <CardBody className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Destination
            </p>
            <div className="flex flex-wrap gap-2">
              {DESTINATIONS.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={d === destination ? "primary" : "outline"}
                  onClick={() => {
                    setDestination(d);
                    setSelectedProfile(null);
                  }}
                >
                  {d}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Route preference
            </p>
            <div className="flex flex-wrap gap-2">
              {PREFERENCES.map((p) => (
                <button
                  key={p}
                  onClick={() => setPreference(p)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    preference === p
                      ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand-dark)]"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {PREFERENCE_WEIGHTS[p].label}
                  <span className="ml-1 text-[10px] text-slate-400">
                    ({Math.round(PREFERENCE_WEIGHTS[p].exposure * 100)}% exposure /{" "}
                    {Math.round(PREFERENCE_WEIGHTS[p].time * 100)}% time)
                  </span>
                </button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`${ORIGIN_LABEL} → ${destination}`}
            subtitle={`Simulated for ${ADVISOR_HOUR}:00 (typical evening traffic peak)`}
            action={
              <button
                onClick={() => setShowExposureColouring((v) => !v)}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
              >
                <MapIcon className="h-3 w-3" />
                {showExposureColouring ? "Exposure colouring: on" : "Exposure colouring: off"}
              </button>
            }
          />
          <CardBody className="h-[420px] p-0">
            <LeafletMap
              center={MAP_CENTER}
              zoom={12}
              fitToContent
              polylines={candidates.flatMap((c) =>
                c.profile === activeProfile && showExposureColouring
                  ? segmentPolylines(c, 6, 0.95)
                  : [
                      {
                        id: c.id,
                        positions: (c.geometry ?? c.waypoints).map((w) => [w.lat, w.lng] as [number, number]),
                        color: PROFILE_COLORS[c.profile],
                        weight: c.profile === activeProfile ? 6 : 3,
                        opacity: c.profile === activeProfile ? 0.95 : 0.4,
                      },
                    ]
              )}
              markers={[
                {
                  id: "origin",
                  lat: (candidates[0].geometry ?? candidates[0].waypoints)[0].lat,
                  lng: (candidates[0].geometry ?? candidates[0].waypoints)[0].lng,
                  color: "#0f172a",
                  radius: 10,
                },
              ]}
            />
          </CardBody>
          {showExposureColouring && (
            <div className="flex flex-wrap gap-3 border-t border-[var(--card-border)] px-5 py-2.5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-full" style={{ background: EXPOSURE_LEVEL_HEX.Low }} /> Low exposure
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-full" style={{ background: EXPOSURE_LEVEL_HEX.Moderate }} /> Moderate exposure
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-full" style={{ background: EXPOSURE_LEVEL_HEX.High }} /> High exposure
              </span>
              <span className="text-slate-400">— highlighted route only</span>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recommended Route"
            subtitle={PREFERENCE_WEIGHTS[preference].label + " preference · modelled estimate"}
          />
          <CardBody className="space-y-3">
            <Badge className="border-[var(--brand)]/30 bg-[var(--brand)]/10 text-[var(--brand-dark)]">
              <Sparkles className="h-3 w-3" /> {recommended.label}
            </Badge>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Wind className="h-3.5 w-3.5" /> Predicted exposure vs fastest
                </span>
                <span className={cn("font-semibold", exposureDelta > 0 ? "text-emerald-700" : exposureDelta < 0 ? "text-rose-600" : "text-slate-700")}>
                  {exposureDelta > 0
                    ? `${exposureDelta}% lower`
                    : exposureDelta < 0
                    ? `${Math.abs(exposureDelta)}% higher`
                    : "Same as fastest"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Clock className="h-3.5 w-3.5" /> Travel time vs fastest
                </span>
                <span className="font-semibold text-slate-700">
                  {timeDelta === 0 ? "Same" : `${timeDelta > 0 ? "+" : ""}${timeDelta} min`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <RouteIcon className="h-3.5 w-3.5" /> Distance
                </span>
                <span className="font-semibold text-slate-700">
                  {recommended.distanceKm} km
                </span>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              {exposureDelta > 0
                ? `${recommended.label} route is recommended because it provides substantially lower predicted pollution exposure with only ${
                    timeDelta <= 0 ? "no increase" : `a ${timeDelta}-minute increase`
                  } in travel time.`
                : `${recommended.label} route is recommended for this preference.`}
            </p>
            <p className="text-xs text-slate-400">
              Modelled estimate — predicted exposure reduction, not a health
              risk reduction estimate.
            </p>
            <ExposureProvenance
              steps={[
                { label: "Route", value: `${ORIGIN_LABEL} → ${destination} (${recommended.label})` },
                { label: "Road network", value: recommended.roadNetworkSource },
                {
                  label: "PM2.5 source",
                  value:
                    recommended.environmentalMode === "historical"
                      ? "DOE/JAS station data (researcher-supplied historical CSV)"
                      : "Prototype synthetic environmental model",
                },
                ...(recommended.segments?.find((s) => s.stationName)
                  ? [{ label: "Nearest station", value: recommended.segments.find((s) => s.stationName)!.stationName! }]
                  : []),
                { label: "Avg PM2.5 across segments", value: `${recommended.avgPm25} µg/m³` },
                { label: "Measurement", value: "Estimated — nearest-station or simulated per road segment, never a direct on-road sensor" },
                { label: "Exposure contribution", value: `${recommended.predictedExposure} units (full route)` },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Candidate routes" />
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-4">Route</th>
                <th className="py-2 pr-4">Travel time</th>
                <th className="py-2 pr-4">Distance</th>
                <th className="py-2 pr-4">Predicted exposure</th>
                <th className="py-2 pr-4">Avg PM2.5</th>
                <th className="py-2">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const isRecommended = c.profile === recommended.profile;
                const level = relativeExposureLabel(candidates, c.predictedExposure);
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedProfile(c.profile)}
                    className={cn(
                      "cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50",
                      activeProfile === c.profile && "bg-slate-50"
                    )}
                  >
                    <td className="py-2.5 pr-4 font-medium text-slate-800">
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ background: PROFILE_COLORS[c.profile] }}
                      />
                      {c.label}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{c.travelTimeMin} min</td>
                    <td className="py-2.5 pr-4 text-slate-600">{c.distanceKm} km</td>
                    <td className="py-2.5 pr-4 text-slate-600">
                      {level}
                      <span className="ml-1 text-xs text-slate-400">({c.predictedExposure})</span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{c.avgPm25} µg/m³</td>
                    <td className="py-2.5">
                      {isRecommended ? (
                        <Badge className="border-[var(--brand)]/30 bg-[var(--brand)]/10 text-[var(--brand-dark)]">
                          Recommended
                        </Badge>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Exposure prediction model"
          subtitle="Gradient-boosted regression trees trained on the synthetic dataset"
        />
        <CardBody>
          <div className="grid grid-cols-3 gap-3 text-center sm:max-w-md">
            <div>
              <div className="text-lg font-semibold text-slate-800">{metrics.mae}</div>
              <div className="text-xs text-slate-400">MAE</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-800">{metrics.rmse}</div>
              <div className="text-xs text-slate-400">RMSE</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-800">{metrics.r2}</div>
              <div className="text-xs text-slate-400">R²</div>
            </div>
          </div>
          <p className="mt-3 text-xs font-medium text-amber-700">
            Model trained using demonstration data; real-world validation
            pending.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Evaluated on a held-out {metrics.nTest.toLocaleString()}-sample
            test split ({metrics.nTrain.toLocaleString()} training samples).
            Performance shown here reflects synthetic demonstration data and
            does not represent real-world model performance.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
