"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FreshnessLabel } from "@/components/ui/FreshnessLabel";
import { LeafletMap } from "@/components/map/LeafletMap";
import { MAP_CENTER, DESTINATIONS, ORIGIN_LABEL } from "@/lib/constants";
import { findBaseRouteByDestination } from "@/lib/baseRoutes";
import { classifyPm25 } from "@/lib/exposure";
import { haversineKm } from "@/lib/geo";
import { saveTrip, newTripId, type GpsObservation, type EnvironmentalSnapshot, type RecordedTrip } from "@/lib/tripStore";
import type { CandidateRoute, RouteProfile, EnvironmentalReading } from "@/lib/types";
import { cn } from "@/lib/cn";
import {
  Navigation,
  MapPin,
  Search,
  Play,
  Pause,
  Square,
  AlertTriangle,
  Wind,
  Clock,
  Gauge,
  Loader2,
} from "lucide-react";

type GpsState = "idle" | "requesting" | "tracking" | "denied" | "unsupported";
type RideState = "setup" | "comparing" | "loading_routes" | "riding" | "paused" | "summary";

const PROFILE_COLORS: Record<RouteProfile, string> = {
  fastest: "#64748b",
  balanced: "#2563eb",
  low_exposure: "#0e6e63",
};

interface RouteFetchResponse {
  routes: CandidateRoute[];
  usedRealRoads: boolean;
  latencyMs: number;
}

export function NavigateClient({ initialReading }: { initialReading: EnvironmentalReading }) {
  const [reading, setReading] = useState<EnvironmentalReading>(initialReading);
  const currentPm25 = reading.pm25 ?? 0;

  // Re-resolves the current-conditions reading for a real coordinate (the
  // rider's actual GPS fix at ride start, when available) via the server
  // route so the EnvironmentalDataProvider — including a live source, if
  // WAQI_TOKEN is configured — gets a genuine location, not just the fixed
  // demo origin used for the page's initial server-rendered reading.
  async function refreshReading(lat: number, lng: number) {
    try {
      const res = await fetch(`/api/environment?lat=${lat}&lng=${lng}`);
      if (!res.ok) return;
      const data = await res.json();
      setReading(data.reading);
    } catch {
      // Network failure — keep showing the last known reading rather than
      // fabricating a new one.
    }
  }

  // --- GPS ---
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [position, setPosition] = useState<{
    lat: number;
    lng: number;
    accuracy: number | null;
    heading: number | null;
    speed: number | null;
    altitude: number | null;
  } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // --- Destination search ---
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [geocodeResults, setGeocodeResults] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [destination, setDestination] = useState<{ label: string; lat: number; lng: number } | null>(null);

  // --- Routes ---
  const [rideState, setRideState] = useState<RideState>("setup");
  const [candidates, setCandidates] = useState<CandidateRoute[]>([]);
  const [usedRealRoads, setUsedRealRoads] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<RouteProfile>("balanced");
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);

  // --- Ride tracking ---
  const [trajectory, setTrajectory] = useState<GpsObservation[]>([]);
  const [rideStartedAt, setRideStartedAt] = useState<string | null>(null);
  const [rideEndedAt, setRideEndedAt] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [routeChanges, setRouteChanges] = useState(0);
  const lastCheckDistanceRef = useRef(0);

  function startLocationTracking() {
    if (!("geolocation" in navigator)) {
      setGpsState("unsupported");
      return;
    }
    setGpsState("requesting");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsState("tracking");
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          heading: pos.coords.heading ?? null,
          speed: pos.coords.speed !== null ? pos.coords.speed * 3.6 : null, // m/s -> km/h
          altitude: pos.coords.altitude ?? null,
        });
      },
      () => setGpsState("denied"),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
  }

  function stopLocationTracking() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsState("idle");
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Force a re-render once a second while riding, so ride duration and
  // estimated cumulative exposure keep advancing even if no new GPS fix
  // arrives (e.g. signal loss) — both are computed from Date.now() at
  // render time, not from GPS updates.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (rideState !== "riding") return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [rideState]);

  // Record a trajectory point whenever a new GPS fix arrives while riding.
  useEffect(() => {
    if (rideState !== "riding" || !position) return;
    setTrajectory((prev) => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        latitude: position.lat,
        longitude: position.lng,
        speed: position.speed,
        heading: position.heading,
        accuracy: position.accuracy,
        altitude: position.altitude,
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, rideState]);

  async function handleGeocode() {
    if (!query.trim()) return;
    setSearching(true);
    setGeocodeResults([]);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setGeocodeResults(data.results ?? []);
    } catch {
      setGeocodeResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function fetchRoutesFor(dest: { label: string; lat: number; lng: number }) {
    const origin = position ?? { lat: MAP_CENTER[0], lng: MAP_CENTER[1] };
    setRideState("loading_routes");
    setRouteError(null);
    try {
      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originLat: origin.lat,
          originLng: origin.lng,
          destLat: dest.lat,
          destLng: dest.lng,
          destLabel: dest.label,
        }),
      });
      const data: RouteFetchResponse = await res.json();
      if (!data.routes || data.routes.length === 0) {
        setRouteError("No route could be generated for this destination.");
        setRideState("setup");
        return;
      }
      setCandidates(data.routes);
      setUsedRealRoads(data.usedRealRoads);
      setLastLatencyMs(data.latencyMs);
      setDestination(dest);
      setSelectedProfile("balanced");
      setRideState("comparing");
    } catch {
      setRouteError("Route service request failed. Check your connection and try again.");
      setRideState("setup");
    }
  }

  function startRide() {
    setTrajectory([]);
    setRideStartedAt(new Date().toISOString());
    setRideEndedAt(null);
    setWarning(null);
    setRouteChanges(0);
    lastCheckDistanceRef.current = 0;
    startLocationTracking();
    setRideState("riding");
    if (position) refreshReading(position.lat, position.lng);
  }

  function pauseRide() {
    stopLocationTracking();
    setRideState("paused");
  }

  function resumeRide() {
    startLocationTracking();
    setRideState("riding");
  }

  function stopRide() {
    stopLocationTracking();
    setRideEndedAt(new Date().toISOString());
    setRideState("summary");
  }

  // --- Derived ride metrics ---
  const observedDistanceKm = useMemo(() => {
    let total = 0;
    for (let i = 1; i < trajectory.length; i++) {
      total += haversineKm(
        { lat: trajectory[i - 1].latitude, lng: trajectory[i - 1].longitude },
        { lat: trajectory[i].latitude, lng: trajectory[i].longitude }
      );
    }
    return total;
  }, [trajectory]);

  const elapsedMin =
    rideStartedAt && (rideState === "riding" || rideState === "paused" || rideState === "summary")
      ? (new Date(rideEndedAt ?? Date.now()).getTime() - new Date(rideStartedAt).getTime()) / 60000
      : 0;

  const avgSpeedKmh = elapsedMin > 0 ? observedDistanceKm / (elapsedMin / 60) : 0;

  // Estimated cumulative exposure: current (static, last-loaded) PM2.5 x
  // elapsed riding time. No live environmental polling — see the "Data
  // updated" label — so this is a modelled running estimate, not a
  // sensor-measured one.
  const cumulativeExposure = currentPm25 * (elapsedMin / 60);
  const exposureLevel = classifyPm25(currentPm25);

  const selectedRoute = candidates.find((c) => c.profile === selectedProfile);
  const fastestRoute = candidates.find((c) => c.profile === "fastest");

  // Basic "higher exposure ahead" check: every ~500m of progress, look at
  // whether the low-exposure candidate offered at ride start would now be
  // meaningfully better than the selected route's own modelled profile.
  // Based on the pre-computed route model, not a live sensor feed.
  useEffect(() => {
    if (rideState !== "riding" || !selectedRoute) return;
    if (observedDistanceKm - lastCheckDistanceRef.current < 0.5) return;
    lastCheckDistanceRef.current = observedDistanceKm;

    const lowExposureRoute = candidates.find((c) => c.profile === "low_exposure");
    if (
      lowExposureRoute &&
      lowExposureRoute.profile !== selectedRoute.profile &&
      lowExposureRoute.predictedExposure < selectedRoute.predictedExposure * 0.85
    ) {
      const reduction = Math.round(
        ((selectedRoute.predictedExposure - lowExposureRoute.predictedExposure) /
          selectedRoute.predictedExposure) *
          100
      );
      const timeDelta = lowExposureRoute.travelTimeMin - selectedRoute.travelTimeMin;
      setWarning(
        `Higher pollution ahead (modelled route conditions). Alternative route available: ${
          timeDelta > 0 ? `+${timeDelta} min` : "similar time"
        }, ↓${reduction}% estimated exposure.`
      );
    }
  }, [observedDistanceKm, rideState, candidates, selectedRoute]);

  function takeAlternative() {
    const lowExposureRoute = candidates.find((c) => c.profile === "low_exposure");
    if (lowExposureRoute) {
      setSelectedProfile("low_exposure");
      setRouteChanges((n) => n + 1);
    }
    setWarning(null);
  }

  async function saveAndFinish() {
    if (!selectedRoute || !destination || !rideStartedAt) return;
    const snapshot: EnvironmentalSnapshot = {
      timestamp: reading.observedAt,
      retrievedAt: reading.retrievedAt,
      pm25: currentPm25,
      pm10: reading.pm10,
      no2: reading.no2,
      source: reading.source,
      stale: reading.mode !== "live",
      mode: reading.mode,
      measurement: reading.measurement,
      stationName: reading.stationName,
      distanceKm: reading.distanceKm,
      interpolationMethod: reading.interpolationMethod,
    };
    const trip: RecordedTrip = {
      id: newTripId(),
      startedAt: rideStartedAt,
      endedAt: rideEndedAt,
      originLabel: ORIGIN_LABEL,
      destinationLabel: destination.label,
      selectedProfile,
      selectedRoute,
      routeComparison: candidates,
      observedTrajectory: trajectory,
      environmentalSnapshots: [snapshot],
      distanceKm: Math.round(observedDistanceKm * 100) / 100,
      durationMin: Math.round(elapsedMin * 10) / 10,
      avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
      estimatedExposure: Math.round(cumulativeExposure * 10) / 10,
      avgPm25: currentPm25,
      maxPm25: currentPm25,
      highExposureMinutes: exposureLevel === "High" ? Math.round(elapsedMin) : 0,
      routeChanges,
    };
    await saveTrip(trip);
    resetAll();
  }

  function resetAll() {
    setRideState("setup");
    setDestination(null);
    setCandidates([]);
    setTrajectory([]);
    setRideStartedAt(null);
    setRideEndedAt(null);
    setWarning(null);
    setQuery("");
    setGeocodeResults([]);
  }

  const mapCenter: [number, number] = position ? [position.lat, position.lng] : MAP_CENTER;

  const routePolylines = candidates.map((c) => ({
    id: c.id,
    positions: (c.geometry ?? c.waypoints).map((w) => [w.lat, w.lng] as [number, number]),
    color: PROFILE_COLORS[c.profile],
    weight: c.profile === selectedProfile ? 6 : 3,
    opacity: c.profile === selectedProfile ? 0.9 : 0.35,
  }));

  const trajectoryPolyline =
    trajectory.length > 1
      ? [
          {
            id: "observed",
            positions: trajectory.map((p) => [p.latitude, p.longitude] as [number, number]),
            color: "#f59e0b",
            weight: 5,
            dashArray: "2 6",
          },
        ]
      : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Navigate</h1>
          <p className="mt-1 text-sm text-slate-500">
            Find routes that balance travel time and estimated air-pollution exposure.
          </p>
        </div>
        <Badge
          className={cn(
            "border",
            gpsState === "tracking"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : gpsState === "denied" || gpsState === "unsupported"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          <Navigation className="h-3 w-3" />
          GPS: {gpsState === "tracking" ? "Connected" : gpsState === "requesting" ? "Waiting" : gpsState === "denied" ? "Denied" : gpsState === "unsupported" ? "Unsupported" : "Not started"}
        </Badge>
      </div>

      <p className="text-xs text-slate-400">
        Location tracking is only active after you start a ride and can be stopped at any time. No
        location is collected before Start Ride.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Map"
            subtitle={
              rideState === "riding" || rideState === "paused"
                ? "Observed trajectory (dashed) vs recommended route (solid)"
                : "Current location and candidate routes"
            }
          />
          <CardBody className="h-[420px] p-0">
            <LeafletMap
              center={mapCenter}
              zoom={13}
              fitToContent={rideState !== "riding"}
              polylines={[...routePolylines, ...trajectoryPolyline]}
              markers={[
                ...(destination ? [{ id: "dest", lat: destination.lat, lng: destination.lng, color: "#0f172a", radius: 10 }] : []),
              ]}
              riderPosition={position ? { lat: position.lat, lng: position.lng } : null}
            />
          </CardBody>
          {(rideState === "riding" || rideState === "paused" || candidates.length > 0) && (
            <div className="flex flex-wrap gap-3 border-t border-[var(--card-border)] px-5 py-2.5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-full bg-slate-500" /> Recommended route
              </span>
              {trajectory.length > 1 && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded-full border border-amber-500" style={{ background: "repeating-linear-gradient(90deg,#f59e0b 0 4px,transparent 4px 8px)" }} />
                  Observed trajectory (actual GPS)
                </span>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Current location" />
            <CardBody className="space-y-2">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={startLocationTracking} disabled={gpsState === "tracking" || gpsState === "requesting"}>
                  <Navigation className="h-3.5 w-3.5" /> Enable GPS
                </Button>
                {gpsState === "tracking" && rideState === "setup" && (
                  <Button size="sm" variant="ghost" onClick={stopLocationTracking}>
                    Stop
                  </Button>
                )}
              </div>
              {position && (
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-slate-400">Lat / Lng</dt>
                    <dd className="font-mono text-slate-700">
                      {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Accuracy</dt>
                    <dd className="font-mono text-slate-700">
                      {position.accuracy ? `${Math.round(position.accuracy)} m` : "—"}
                    </dd>
                  </div>
                </dl>
              )}
              {gpsState === "denied" && (
                <p className="text-xs text-amber-600">
                  GPS unavailable. Please enable location services and grant permission.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Current environment" />
            <CardBody className="space-y-2">
              <Badge className={cn(exposureLevel === "High" ? "border-rose-200 bg-rose-50 text-rose-700" : exposureLevel === "Moderate" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
                {exposureLevel}
              </Badge>
              <FreshnessLabel reading={reading} />
            </CardBody>
          </Card>
        </div>
      </div>

      {rideState === "setup" && (
        <Card>
          <CardHeader title="Where are you going?" />
          <CardBody className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGeocode()}
                  placeholder="Search a destination in Malaysia…"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <Button size="sm" onClick={handleGeocode} disabled={searching}>
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
              </Button>
            </div>

            {geocodeResults.length > 0 && (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {geocodeResults.map((r) => (
                  <button
                    key={`${r.lat}-${r.lng}`}
                    onClick={() => fetchRoutesFor(r)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Or pick a Klang Valley demo destination
              </p>
              <div className="flex flex-wrap gap-2">
                {DESTINATIONS.map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const base = findBaseRouteByDestination(d);
                      const dest = base.waypoints[base.waypoints.length - 1];
                      fetchRoutesFor({ label: d, lat: dest.lat, lng: dest.lng });
                    }}
                  >
                    {d}
                  </Button>
                ))}
              </div>
            </div>

            {routeError && <p className="text-xs text-rose-600">{routeError}</p>}
          </CardBody>
        </Card>
      )}

      {rideState === "loading_routes" && (
        <Card>
          <CardBody className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Retrieving real road routes and estimating exposure…
          </CardBody>
        </Card>
      )}

      {rideState === "comparing" && destination && (
        <Card>
          <CardHeader
            title={`${ORIGIN_LABEL} → ${destination.label}`}
            subtitle={usedRealRoads ? "Real road-following routes via OSRM" : "Demonstration routes (routing service unavailable)"}
            action={lastLatencyMs !== null && <span className="text-xs text-slate-400">Route latency: {lastLatencyMs}ms</span>}
          />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {candidates.map((c) => {
                const isSelected = c.profile === selectedProfile;
                const pctOfFastest = fastestRoute
                  ? Math.round((c.predictedExposure / fastestRoute.predictedExposure) * 100)
                  : 100;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedProfile(c.profile)}
                    className={cn(
                      "rounded-xl border-2 p-4 text-left transition-colors",
                      isSelected ? "border-[var(--brand)] bg-[var(--brand)]/5" : "border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PROFILE_COLORS[c.profile] }} />
                      {c.label}
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">{c.travelTimeMin} min</div>
                    <div className="text-xs text-slate-500">{c.distanceKm} km</div>
                    <div className="mt-2 text-sm text-slate-600">
                      Estimated exposure: <span className="font-semibold">{pctOfFastest}%</span>
                      <span className="text-xs text-slate-400"> of fastest route</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <Button onClick={startRide} disabled={!selectedRoute}>
              <Play className="h-4 w-4" /> Start Ride
            </Button>
          </CardBody>
        </Card>
      )}

      {(rideState === "riding" || rideState === "paused") && selectedRoute && (
        <Card>
          <CardHeader title="Live navigation" subtitle={`${ORIGIN_LABEL} → ${destination?.label} · ${selectedRoute.label} route`} />
          <CardBody className="space-y-4">
            {warning && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <p>{warning}</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={takeAlternative}>
                      Take alternative
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setWarning(null)}>
                      Stay on route
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" /> Ride duration
                </div>
                <div className="text-2xl font-bold text-slate-900">{elapsedMin.toFixed(1)}m</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xs text-slate-400">
                  <Gauge className="h-3 w-3" /> Current speed
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {position?.speed ? Math.round(position.speed) : "—"}
                  <span className="text-sm font-normal"> km/h</span>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-xs text-slate-400">Distance travelled</div>
                <div className="text-2xl font-bold text-slate-900">{observedDistanceKm.toFixed(1)} km</div>
              </div>
              <div className="rounded-lg bg-[var(--brand)]/5 p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xs text-slate-400">
                  <Wind className="h-3 w-3" /> Est. cumulative exposure
                </div>
                <div className="text-2xl font-bold text-[var(--brand-dark)]">{cumulativeExposure.toFixed(1)}</div>
              </div>
            </div>

            <div className="flex gap-2">
              {rideState === "riding" ? (
                <Button variant="outline" onClick={pauseRide}>
                  <Pause className="h-4 w-4" /> Pause Ride
                </Button>
              ) : (
                <Button variant="outline" onClick={resumeRide}>
                  <Play className="h-4 w-4" /> Resume Ride
                </Button>
              )}
              <Button variant="danger" onClick={stopRide}>
                <Square className="h-4 w-4" /> Stop Ride
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {rideState === "summary" && selectedRoute && fastestRoute && (
        <Card>
          <CardHeader title="Trip summary" subtitle={`${ORIGIN_LABEL} → ${destination?.label}`} />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-xs text-slate-400">Distance</div>
                <div className="text-xl font-bold text-slate-900">{observedDistanceKm.toFixed(1)} km</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-xs text-slate-400">Duration</div>
                <div className="text-xl font-bold text-slate-900">{elapsedMin.toFixed(1)} min</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-xs text-slate-400">Avg speed</div>
                <div className="text-xl font-bold text-slate-900">{avgSpeedKmh.toFixed(1)} km/h</div>
              </div>
              <div className="rounded-lg bg-[var(--brand)]/5 p-3 text-center">
                <div className="text-xs text-slate-400">Est. cumulative exposure</div>
                <div className="text-xl font-bold text-[var(--brand-dark)]">{cumulativeExposure.toFixed(1)}</div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Route comparison</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-1.5 pr-3">Route</th>
                    <th className="py-1.5 pr-3">Time</th>
                    <th className="py-1.5 pr-3">Distance</th>
                    <th className="py-1.5">Estimated exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id} className={cn("border-b border-slate-100 last:border-0", c.profile === selectedProfile && "bg-slate-50 font-medium")}>
                      <td className="py-1.5 pr-3">{c.label}{c.profile === selectedProfile && " (selected)"}</td>
                      <td className="py-1.5 pr-3">{c.travelTimeMin} min</td>
                      <td className="py-1.5 pr-3">{c.distanceKm} km</td>
                      <td className="py-1.5">{c.predictedExposure}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">
                Exposure reduction vs fastest route:{" "}
                <span className="font-semibold text-emerald-700">
                  {Math.round(((fastestRoute.predictedExposure - selectedRoute.predictedExposure) / fastestRoute.predictedExposure) * 100)}%
                </span>
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={saveAndFinish}>Save trip &amp; finish</Button>
              <Button variant="ghost" onClick={resetAll}>
                Discard
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
