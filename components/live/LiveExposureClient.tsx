"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, ExposureBadge } from "@/components/ui/Badge";
import { StatTile } from "@/components/ui/StatTile";
import { EnvironmentalModeBadge } from "@/components/ui/EnvironmentalModeBadge";
import { LeafletMap } from "@/components/map/LeafletMap";
import { resamplePolyline, type LatLngLike } from "@/lib/geo";
import { segmentDose, sumExposure, classifyTripExposure } from "@/lib/exposure";
import { MAP_CENTER, ORIGIN_LABEL, POPULAR_DESTINATIONS, TRAFFIC_LEVEL_LABELS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import type { EnvironmentalReading, PointTrafficReading, CandidateRoute, RouteProfile } from "@/lib/types";
import {
  MapPin,
  Navigation,
  Play,
  Square,
  Satellite,
  Loader2,
  Search,
  Locate,
  Gauge,
  Wind,
  Zap,
  Scale,
  Leaf,
} from "lucide-react";

const ANIMATION_STEPS = 90;
const STEP_MS = 180;
// Real environmental/traffic data is fetched for a coarser set of points
// along the route (not once per animation frame) — the same "bounded
// samples along the route" approach used for live PM2.5/traffic elsewhere
// (see lib/liveTraffic.ts), so starting a demo ride costs a fixed, small
// number of real API calls regardless of ANIMATION_STEPS.
const DATA_SAMPLE_COUNT = 16;
// Real OSRM route geometry carries no per-point road classification (that
// only exists on the hand-authored procedural waypoints this page used to
// use) — this is a reasonable fixed default for the traffic API's
// synthetic-fallback tier only; its real (TomTom) tier ignores it entirely.
const DEFAULT_ROAD_TYPE = "arterial";
const FALLBACK_SPEED_KMH = 30;

type GeoState = "idle" | "requesting" | "tracking" | "denied";

interface Place {
  label: string;
  lat: number;
  lng: number;
}

interface RouteFetchResponse {
  routes: CandidateRoute[];
  usedRealRoads: boolean;
}

const PROFILE_COLORS: Record<RouteProfile, string> = {
  fastest: "#64748b",
  balanced: "#2563eb",
  low_exposure: "#0e6e63",
};

const PROFILE_META: Record<RouteProfile, { icon: typeof Zap; label: string }> = {
  fastest: { icon: Zap, label: "Fastest" },
  balanced: { icon: Scale, label: "Balanced" },
  low_exposure: { icon: Leaf, label: "Low exposure" },
};

const MUTED_ROUTE_COLOR = "#94a3b8";
const SELECTED_ROUTE_COLOR = "#0e6e63";

async function fetchEnvironmentReading(lat: number, lng: number): Promise<EnvironmentalReading> {
  const res = await fetch(`/api/environment?lat=${lat}&lng=${lng}`);
  if (!res.ok) throw new Error("environment fetch failed");
  const json = await res.json();
  return json.reading as EnvironmentalReading;
}

async function fetchTrafficReading(
  lat: number,
  lng: number,
  hour: number,
  roadType: string
): Promise<PointTrafficReading> {
  const res = await fetch(`/api/traffic?lat=${lat}&lng=${lng}&hour=${hour}&roadType=${roadType}`);
  if (!res.ok) throw new Error("traffic fetch failed");
  return res.json();
}

export function LiveExposureClient() {
  // --- real browser GPS tracking (independent of route planning below) ---
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [geoPos, setGeoPos] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // --- route planning (real roads via the same /api/routes OSRM pipeline
  // the AI Route Advisor and Home page use) ---
  const [origin, setOrigin] = useState<Place>({ label: ORIGIN_LABEL, lat: MAP_CENTER[0], lng: MAP_CENTER[1] });
  const [destination, setDestination] = useState<Place | null>(null);
  const [candidates, setCandidates] = useState<CandidateRoute[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<RouteProfile | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [originQuery, setOriginQuery] = useState("");
  const [originResults, setOriginResults] = useState<Place[]>([]);
  const [originSearching, setOriginSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  const [destQuery, setDestQuery] = useState("");
  const [destResults, setDestResults] = useState<Place[]>([]);
  const [destSearching, setDestSearching] = useState(false);

  // --- ride simulation along the selected real route ---
  const [rideState, setRideState] = useState<"idle" | "loading" | "playing" | "finished">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [doses, setDoses] = useState<number[]>([]);
  const [readings, setReadings] = useState<EnvironmentalReading[]>([]);
  const [trafficReadings, setTrafficReadings] = useState<PointTrafficReading[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopDemoRide() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRideState("idle");
    setStepIndex(0);
    setDoses([]);
    setReadings([]);
    setTrafficReadings([]);
    setDataError(null);
  }

  async function fetchRoutes(nextOrigin: Place, nextDestination: Place) {
    stopDemoRide();
    setRouteLoading(true);
    setRouteError(null);
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
        setRouteError(
          !data.usedRealRoads
            ? "The live road-routing service (OSRM) is unreachable right now, so no route can be shown for this trip. Try again shortly."
            : "No route could be found between these two points."
        );
        return;
      }
      setCandidates(data.routes);
      const recommended = data.routes.find((c) => c.profile === "low_exposure") ?? data.routes[0];
      setSelectedProfile(recommended.profile);
    } catch {
      setCandidates([]);
      setRouteError("Connection lost. Please check your network and try again.");
    } finally {
      setRouteLoading(false);
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
    if (destination) fetchRoutes(place, destination);
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

  const selectedRoute = candidates.find((c) => c.profile === selectedProfile) ?? null;
  const routeGeometry: LatLngLike[] = selectedRoute?.geometry ?? [];
  // The selected route's own real average speed (distance / real travel
  // time), not an assumed constant — a highway route and a residential
  // detour animate at genuinely different paces.
  const routeSpeedKmh =
    selectedRoute && selectedRoute.travelTimeMin > 0
      ? selectedRoute.distanceKm / (selectedRoute.travelTimeMin / 60)
      : FALLBACK_SPEED_KMH;

  const resampled = useMemo<LatLngLike[]>(
    () => (routeGeometry.length > 1 ? resamplePolyline(routeGeometry, ANIMATION_STEPS) : []),
    [routeGeometry]
  );
  // A coarser sample set than `resampled` — see DATA_SAMPLE_COUNT.
  const dataPoints = useMemo<LatLngLike[]>(
    () => (routeGeometry.length > 1 ? resamplePolyline(routeGeometry, DATA_SAMPLE_COUNT) : []),
    [routeGeometry]
  );

  const stepDistanceKm = selectedRoute ? selectedRoute.distanceKm / (resampled.length - 1 || 1) : 0;
  const stepDurationHours = routeSpeedKmh > 0 ? stepDistanceKm / routeSpeedKmh : 0;

  const currentPoint = resampled[Math.min(stepIndex, resampled.length - 1)];
  const dataIndex =
    dataPoints.length <= 1
      ? 0
      : Math.min(
          dataPoints.length - 1,
          Math.round((stepIndex / (ANIMATION_STEPS - 1)) * (dataPoints.length - 1))
        );
  const currentReading = readings[dataIndex] ?? null;
  const currentTraffic = trafficReadings[dataIndex] ?? null;
  const currentSample =
    currentReading && currentTraffic
      ? {
          trafficLevel: currentTraffic.trafficLevel,
          pm25: currentReading.pm25,
          pm10: currentReading.pm10,
          no2: currentReading.no2,
        }
      : null;

  function startLocationTracking() {
    if (!("geolocation" in navigator)) {
      setGeoState("denied");
      return;
    }
    setGeoState("requesting");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoState("tracking");
        setGeoPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      () => {
        setGeoState("denied");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }

  function stopLocationTracking() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGeoState("idle");
    setGeoPos(null);
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function startDemoRide() {
    if (!selectedRoute || resampled.length < 2 || dataPoints.length < 1) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    const now = new Date();
    let hour = now.getHours();
    // Keep the simulated hour within the rider's typical commute peaks
    // (07:00-09:00 or 17:00-20:00), used only to bias the traffic API's
    // synthetic fallback tier toward realistic rush-hour congestion when
    // TomTom isn't configured — real PM2.5/traffic readings (when
    // available) reflect actual current conditions regardless of this.
    const inMorningPeak = hour >= 7 && hour < 9;
    const inEveningPeak = hour >= 17 && hour < 20;
    if (!inMorningPeak && !inEveningPeak) hour = 18;

    setStepIndex(0);
    setDoses([]);
    setDataError(null);
    setRideState("loading");

    try {
      const [envResults, trafficResults] = await Promise.all([
        Promise.all(dataPoints.map((p) => fetchEnvironmentReading(p.lat, p.lng))),
        Promise.all(dataPoints.map((p) => fetchTrafficReading(p.lat, p.lng, hour, DEFAULT_ROAD_TYPE))),
      ]);
      setReadings(envResults);
      setTrafficReadings(trafficResults);
    } catch {
      setDataError("Couldn't reach real environmental/traffic data sources — try again.");
      setRideState("idle");
      return;
    }

    setRideState("playing");
    intervalRef.current = setInterval(() => {
      setStepIndex((prev) => {
        const next = prev + 1;
        if (next >= ANIMATION_STEPS) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setRideState("finished");
          return ANIMATION_STEPS - 1;
        }
        return next;
      });
    }, STEP_MS);
  }

  // Accumulate dose whenever the current sample changes during playback —
  // real PM2.5 (from the tiered live/historical/synthetic data resolved at
  // ride start) x real elapsed time for this step, same dose formula as
  // the route advisor (lib/routeExposure.ts).
  useEffect(() => {
    if (rideState !== "playing" || !currentSample || currentSample.pm25 === null) return;
    setDoses((prev) => [
      ...prev,
      segmentDose(currentSample.pm25 as number, stepDurationHours),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, rideState]);

  const cumulativeExposure = sumExposure(doses);
  const exposureLevel = classifyTripExposure(cumulativeExposure);
  const distanceCoveredKm = selectedRoute ? Math.min(selectedRoute.distanceKm, stepDistanceKm * stepIndex) : 0;
  const elapsedMin = routeSpeedKmh > 0 ? (distanceCoveredKm / routeSpeedKmh) * 60 : 0;

  const isDemoMode = geoState !== "tracking";

  // Idle: preview every candidate route, the selected one in the brand
  // accent colour, the rest muted grey — tap any to switch which route the
  // demo ride will follow. Once riding, show only the active route so the
  // animation isn't competing visually with the other candidates.
  const candidatePolylines =
    rideState === "idle"
      ? candidates.map((c) => ({
          id: c.id,
          positions: (c.geometry ?? c.waypoints).map((w) => [w.lat, w.lng] as [number, number]),
          color: c.profile === selectedProfile ? SELECTED_ROUTE_COLOR : MUTED_ROUTE_COLOR,
          weight: c.profile === selectedProfile ? 6 : 3,
          opacity: c.profile === selectedProfile ? 0.95 : 0.5,
        }))
      : resampled.length > 1
      ? [
          {
            id: "active-route",
            positions: resampled.map((p) => [p.lat, p.lng] as [number, number]),
            color: SELECTED_ROUTE_COLOR,
            weight: 5,
            opacity: 0.95,
          },
        ]
      : [];

  const markers =
    destination
      ? [
          { id: "origin", lat: origin.lat, lng: origin.lng, color: "#0e6e63", radius: 9 },
          { id: "destination", lat: destination.lat, lng: destination.lng, color: "#334155", radius: 9 },
        ]
      : [];

  const riderPosition =
    rideState !== "idle" && currentPoint
      ? { lat: currentPoint.lat, lng: currentPoint.lng }
      : geoState === "tracking" && geoPos
      ? { lat: geoPos.lat, lng: geoPos.lng }
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Live Exposure
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Plan a real road route, then simulate a ride along it with live environmental telemetry.
        </p>
      </div>

      <Card>
        <CardHeader title="Plan a route" subtitle="Real road-following routes via OpenStreetMap/OSRM" />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Origin / Current location
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
                <Button size="sm" variant="outline" onClick={useMyLocation} disabled={locating} aria-label="Use my current location">
                  {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Locate className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3 w-3 shrink-0" />
                Current: <span className="font-medium text-slate-700">{origin.label}</span>
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
                Current: <span className="font-medium text-slate-700">{destination?.label ?? "Not set"}</span>
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
                  {POPULAR_DESTINATIONS.slice(0, 6).map((d) => (
                    <button
                      key={d.label}
                      onClick={() => pickDestination(d)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        d.label === destination?.label
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

          {routeLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Finding real routes…
            </div>
          )}
          {!routeLoading && routeError && <p className="text-sm text-rose-600">{routeError}</p>}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Route map"
            subtitle={destination ? `${origin.label} → ${destination.label}` : "Search a destination above"}
            action={
              isDemoMode ? (
                <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                  <Satellite className="h-3 w-3" /> Demo GPS Mode
                </Badge>
              ) : (
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  <MapPin className="h-3 w-3" /> Live GPS
                </Badge>
              )
            }
          />
          <CardBody className="h-[420px] p-0">
            <LeafletMap
              center={
                riderPosition
                  ? [riderPosition.lat, riderPosition.lng]
                  : destination
                  ? [destination.lat, destination.lng]
                  : MAP_CENTER
              }
              zoom={13}
              polylines={candidatePolylines}
              markers={rideState === "idle" ? markers : []}
              riderPosition={riderPosition}
              fitToContent={candidates.length > 0 && rideState === "idle"}
              heightClass="h-full"
            />
          </CardBody>
          {candidates.length > 0 && rideState === "idle" && (
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--card-border)] px-5 py-2.5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-full" style={{ background: SELECTED_ROUTE_COLOR }} /> Selected route
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-full" style={{ background: MUTED_ROUTE_COLOR }} /> Alternative
              </span>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Browser geolocation" />
            <CardBody className="space-y-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={startLocationTracking}
                  disabled={geoState === "tracking" || geoState === "requesting"}
                >
                  <Navigation className="h-3.5 w-3.5" /> Start Location Tracking
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={stopLocationTracking}
                  disabled={geoState !== "tracking"}
                >
                  Stop
                </Button>
              </div>
              {geoState === "denied" && (
                <p className="text-xs text-amber-600">
                  Location permission unavailable or denied — using Demo GPS
                  Mode instead.
                </p>
              )}
              {geoState === "tracking" && geoPos && (
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-slate-400">Latitude</dt>
                    <dd className="font-mono text-slate-700">{geoPos.lat.toFixed(5)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Longitude</dt>
                    <dd className="font-mono text-slate-700">{geoPos.lng.toFixed(5)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Accuracy</dt>
                    <dd className="font-mono text-slate-700">{geoPos.accuracy} m</dd>
                  </div>
                </dl>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Demo ride"
              subtitle="Follows the selected route below — real PM2.5/traffic fetched along it, only motion/timing is simulated"
            />
            <CardBody className="space-y-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={startDemoRide}
                  disabled={!selectedRoute || rideState === "playing" || rideState === "loading"}
                >
                  {rideState === "loading" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching real data…
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" /> Start Demo Ride
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={stopDemoRide}
                  disabled={rideState === "idle"}
                >
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              </div>
              {!selectedRoute && (
                <p className="text-xs text-slate-400">Plan a route above to enable the demo ride.</p>
              )}
              {dataError && <p className="text-xs text-rose-600">{dataError}</p>}
            </CardBody>
          </Card>
        </div>
      </div>

      {candidates.length > 0 && (
        <Card>
          <CardHeader
            title="Suggested routes"
            subtitle="Tap a route to preview it on the map and select it for the demo ride"
          />
          <CardBody className="space-y-2">
            {candidates.map((c) => {
              const Icon = PROFILE_META[c.profile].icon;
              const isSelected = c.profile === selectedProfile;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedProfile(c.profile)}
                  disabled={rideState === "playing" || rideState === "loading"}
                  className={cn(
                    "flex w-full min-h-[44px] items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    isSelected ? "border-[var(--brand)] bg-[var(--brand)]/5" : "border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: PROFILE_COLORS[c.profile] }}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      {PROFILE_META[c.profile].label}
                      {c.profile === "low_exposure" && (
                        <span className="text-[10px] font-medium text-emerald-600">— Recommended</span>
                      )}
                    </div>
                    <div className="text-sm text-slate-600">
                      {c.travelTimeMin} min <span className="text-slate-400">· {c.distanceKm} km</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Gauge className="h-3 w-3" /> {TRAFFIC_LEVEL_LABELS[c.trafficLevel]} traffic
                      </span>
                      <span className="flex items-center gap-1">
                        <Wind className="h-3 w-3" /> AQI {c.avgAqi} · {c.avgPm25} µg/m³
                      </span>
                      <span>Exposure: {c.predictedExposure}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </CardBody>
        </Card>
      )}

      {(rideState === "playing" || rideState === "finished") && currentSample && selectedRoute && (
        <Card>
          <CardHeader
            title="Ride exposure telemetry"
            subtitle={
              rideState === "finished"
                ? "Ride complete"
                : `${origin.label} → ${destination?.label ?? ""} (${PROFILE_META[selectedRoute.profile].label}) — in progress`
            }
            action={currentReading ? <EnvironmentalModeBadge mode={currentReading.mode} /> : undefined}
          />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatTile label="PM2.5" value={currentSample.pm25 ?? "—"} unit="µg/m³" />
              <StatTile label="PM10" value={currentSample.pm10 ?? "—"} unit="µg/m³" />
              <StatTile label="NO2" value={currentSample.no2 ?? "—"} unit="ppb" />
              <StatTile
                label="Cumulative exposure"
                value={cumulativeExposure.toFixed(1)}
                unit="units"
                hint={<ExposureBadge level={exposureLevel} />}
              />
              <StatTile
                label="Distance / elapsed"
                value={`${distanceCoveredKm.toFixed(1)} km`}
                unit={`~${elapsedMin.toFixed(0)} min`}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                Traffic: {TRAFFIC_LEVEL_LABELS[currentSample.trafficLevel]}
                {currentTraffic ? ` (${currentTraffic.mode})` : ""}
              </Badge>
            </div>
            {currentReading && (
              <p className="mt-2 text-xs text-slate-500">
                PM2.5 source: {currentReading.source}
                {currentReading.stationName ? ` — ${currentReading.stationName}` : ""}
                {currentReading.distanceKm !== undefined ? ` (${currentReading.distanceKm} km away)` : ""}
              </p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
