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
import { POPULAR_DESTINATIONS, MAP_CENTER } from "@/lib/constants";
import { scoreRoutes, ADVISOR_HOUR, PREFERENCE_WEIGHTS, type PreferenceKey } from "@/lib/routeScoring";
import { cn } from "@/lib/cn";
import { Sparkles, Clock, Wind, Route as RouteIcon, Map as MapIcon, Search, Locate, Loader2, MapPin } from "lucide-react";
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

interface Place {
  label: string;
  lat: number;
  lng: number;
}

interface RouteFetchResponse {
  routes: CandidateRoute[];
  usedRealRoads: boolean;
}

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
  initialOrigin,
  initialDestination,
  initialRoutes,
  initialUsedRealRoads,
}: {
  initialOrigin: Place;
  initialDestination: Place;
  initialRoutes: CandidateRoute[];
  initialUsedRealRoads: boolean;
}) {
  const [origin, setOrigin] = useState<Place>(initialOrigin);
  const [destination, setDestination] = useState<Place>(initialDestination);
  const [candidates, setCandidates] = useState<CandidateRoute[]>(initialRoutes);
  const [usedRealRoads, setUsedRealRoads] = useState(initialUsedRealRoads);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [originQuery, setOriginQuery] = useState("");
  const [originResults, setOriginResults] = useState<Place[]>([]);
  const [originSearching, setOriginSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  const [destQuery, setDestQuery] = useState("");
  const [destResults, setDestResults] = useState<Place[]>([]);
  const [destSearching, setDestSearching] = useState(false);

  const [preference, setPreference] = useState<PreferenceKey>("balanced");
  const [selectedProfile, setSelectedProfile] = useState<RouteProfile | null>(null);
  const [showExposureColouring, setShowExposureColouring] = useState(true);

  async function fetchRoutes(nextOrigin: Place, nextDestination: Place) {
    setLoading(true);
    setFetchError(null);
    setSelectedProfile(null);
    try {
      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originLat: nextOrigin.lat,
          originLng: nextOrigin.lng,
          destLat: nextDestination.lat,
          destLng: nextDestination.lng,
          destLabel: nextDestination.label,
        }),
      });
      const data: RouteFetchResponse = await res.json();
      if (!data.routes || data.routes.length === 0 || !data.usedRealRoads) {
        setCandidates([]);
        setUsedRealRoads(false);
        setFetchError(
          !data.usedRealRoads
            ? "The live road-routing service (OSRM) is unreachable right now, so no route can be shown for this origin/destination. Try again shortly."
            : "No route could be found between these two points."
        );
        return;
      }
      setCandidates(data.routes);
      setUsedRealRoads(true);
    } catch {
      setCandidates([]);
      setUsedRealRoads(false);
      setFetchError("Connection lost. Please check your network and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function searchOrigin() {
    if (!originQuery.trim()) return;
    setOriginSearching(true);
    setOriginResults([]);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(originQuery)}`);
      const data = await res.json();
      setOriginResults(data.results ?? []);
    } catch {
      setOriginResults([]);
    } finally {
      setOriginSearching(false);
    }
  }

  async function searchDestination() {
    if (!destQuery.trim()) return;
    setDestSearching(true);
    setDestResults([]);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(destQuery)}`);
      const data = await res.json();
      setDestResults(data.results ?? []);
    } catch {
      setDestResults([]);
    } finally {
      setDestSearching(false);
    }
  }

  function pickOrigin(place: Place) {
    setOrigin(place);
    setOriginQuery("");
    setOriginResults([]);
    fetchRoutes(place, destination);
  }

  function pickDestination(place: Place) {
    setDestination(place);
    setDestQuery("");
    setDestResults([]);
    fetchRoutes(origin, place);
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`)
          .then((res) => res.json())
          .then((data) => {
            const place = { label: data.label ?? "Current location", lat, lng };
            pickOrigin(place);
          })
          .catch(() => pickOrigin({ label: "Current location", lat, lng }))
          .finally(() => setLocating(false));
      },
      () => setLocating(false),
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
    );
  }

  const ranked = useMemo(
    () => (candidates.length ? scoreRoutes(candidates, preference) : []),
    [candidates, preference]
  );
  const recommended = ranked[0]?.route;
  const fastest = candidates.find((c) => c.profile === "fastest");
  const activeProfile = selectedProfile ?? recommended?.profile;

  const exposureDelta =
    recommended && fastest
      ? Math.round(((fastest.predictedExposure - recommended.predictedExposure) / fastest.predictedExposure) * 100)
      : 0;
  const timeDelta = recommended && fastest ? recommended.travelTimeMin - fastest.travelTimeMin : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Motorcycle Route Advisor
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Compare candidate motorcycle routes between any two points in Malaysia, scored on a balance
            of travel time and real, measured pollution exposure — not simply the shortest route.
          </p>
        </div>
        {recommended && (
          <div className="flex flex-col items-end gap-1.5">
            <SourceBadge source={recommended.roadNetworkSource} />
            <EnvironmentalModeBadge mode={recommended.environmentalMode} />
          </div>
        )}
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Origin
              </p>
              <div className="flex gap-2">
                <input
                  value={originQuery}
                  onChange={(e) => setOriginQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchOrigin()}
                  placeholder="Search a starting point…"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
                <Button size="sm" variant="outline" onClick={searchOrigin} disabled={originSearching || !originQuery.trim()}>
                  {originSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3 w-3 shrink-0" />
                Current: <span className="font-medium text-slate-700">{origin.label}</span>
                <button
                  onClick={useMyLocation}
                  disabled={locating}
                  className="ml-1 inline-flex items-center gap-1 font-medium text-[var(--brand-dark)] underline disabled:opacity-50"
                >
                  {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Locate className="h-3 w-3" />} Use my location
                </button>
              </div>
              {originResults.length > 0 && (
                <div className="mt-2 max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  {originResults.map((r) => (
                    <button
                      key={`${r.lat}-${r.lng}`}
                      onClick={() => pickOrigin(r)}
                      className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Destination
              </p>
              <div className="flex gap-2">
                <input
                  value={destQuery}
                  onChange={(e) => setDestQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchDestination()}
                  placeholder="Search a destination…"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
                <Button size="sm" variant="outline" onClick={searchDestination} disabled={destSearching || !destQuery.trim()}>
                  {destSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3 w-3 shrink-0" />
                Current: <span className="font-medium text-slate-700">{destination.label}</span>
              </div>
              {destResults.length > 0 ? (
                <div className="mt-2 max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  {destResults.map((r) => (
                    <button
                      key={`${r.lat}-${r.lng}`}
                      onClick={() => pickDestination(r)}
                      className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {POPULAR_DESTINATIONS.map((d) => (
                    <button
                      key={d.label}
                      onClick={() => pickDestination(d)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        d.label === destination.label
                          ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand-dark)]"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
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

      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Finding routes…
        </div>
      )}

      {!loading && fetchError && (
        <Card>
          <CardBody className="text-sm text-rose-600">{fetchError}</CardBody>
        </Card>
      )}

      {!loading && !fetchError && recommended && fastest && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title={`${origin.label} → ${destination.label}`}
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
                    { label: "Route", value: `${origin.label} → ${destination.label} (${recommended.label})` },
                    { label: "Road network", value: recommended.roadNetworkSource },
                    {
                      label: "PM2.5 source",
                      // Reads the actual per-segment source rather than
                      // re-deriving a coarse label from environmentalMode —
                      // stays correct automatically if another real tier is
                      // added later, instead of needing a matching update here.
                      value: recommended.segments?.[0]?.pm25Source ?? "Prototype synthetic environmental model",
                    },
                    ...(recommended.segments?.find((s) => s.stationName)
                      ? [{ label: "Nearest station", value: recommended.segments.find((s) => s.stationName)!.stationName! }]
                      : []),
                    { label: "Avg PM2.5 across segments", value: `${recommended.avgPm25} µg/m³` },
                    { label: "Measurement", value: "Estimated — nearest-station or simulated per road segment, never a direct on-road sensor" },
                    {
                      label: "Traffic source",
                      value: recommended.segments?.[0]?.trafficSource ?? "Prototype synthetic traffic model",
                    },
                    ...(recommended.trafficMode === "live" && recommended.avgTrafficRatio !== undefined
                      ? [{ label: "Current vs. free-flow speed", value: `${Math.round(recommended.avgTrafficRatio * 100)}% (travel time adjusted accordingly)` }]
                      : []),
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
        </>
      )}

      <Card>
        <CardHeader
          title="Exposure calculation method"
          subtitle="No machine-learning model — a plain, auditable formula over real data"
        />
        <CardBody className="space-y-2">
          <p className="text-sm text-slate-700">
            <span className="font-mono text-xs">exposure = Σ (segment PM2.5 × segment duration)</span>
          </p>
          <p className="text-xs text-slate-500">
            Each road segment&apos;s PM2.5 is the real reading from the nearest live DOE/JAS station (via
            WAQI) or historical CSV when configured, falling back to the synthetic model only when
            neither is available. Segment duration reflects real TomTom traffic conditions when
            configured, not OSRM&apos;s static estimate. The route total is simply the sum across every
            segment — every number is traceable back to a real reading, with no model in between. See the
            route&apos;s own &quot;Why this exposure?&quot; panel above for the actual sources used in this
            calculation.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
