"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { BottomSheet, type SheetState } from "@/components/ui/BottomSheet";
import { LeafletMap } from "@/components/map/LeafletMap";
import { useImmersive } from "@/components/layout/AppShell";
import { MAP_CENTER, POPULAR_DESTINATIONS, ORIGIN_LABEL } from "@/lib/constants";
import { classifyPm25 } from "@/lib/exposure";
import { haversineKm } from "@/lib/geo";
import { saveTrip, newTripId, getAllTrips, type GpsObservation, type EnvironmentalSnapshot, type RecordedTrip } from "@/lib/tripStore";
import type { CandidateRoute, RouteProfile, EnvironmentalReading } from "@/lib/types";
import { cn } from "@/lib/cn";
import {
  MapPin,
  Search,
  Square,
  AlertTriangle,
  Locate,
  Loader2,
  Zap,
  Scale,
  Leaf,
  CheckCircle2,
  Wind,
} from "lucide-react";

type GpsState = "idle" | "requesting" | "tracking" | "denied" | "unsupported";
type RideState = "setup" | "loading_routes" | "comparing" | "permission" | "riding" | "paused" | "summary";

const PROFILE_COLORS: Record<RouteProfile, string> = {
  fastest: "#64748b",
  balanced: "#2563eb",
  low_exposure: "#0e6e63",
};

const PROFILE_META: Record<RouteProfile, { icon: typeof Zap; label: string }> = {
  fastest: { icon: Zap, label: "Fastest" },
  balanced: { icon: Scale, label: "Balanced" },
  low_exposure: { icon: Leaf, label: "Lower exposure" },
};

interface RouteFetchResponse {
  routes: CandidateRoute[];
  usedRealRoads: boolean;
  latencyMs: number;
}

function AirQualityWord(level: "Low" | "Moderate" | "High") {
  return level === "Low" ? "Good" : level === "Moderate" ? "Moderate" : "Poor";
}

export function NavigateClient({ initialReading }: { initialReading: EnvironmentalReading }) {
  const router = useRouter();
  const { setImmersive } = useImmersive();
  const [reading, setReading] = useState<EnvironmentalReading>(initialReading);
  const currentPm25 = reading.pm25 ?? 0;

  async function refreshReading(lat: number, lng: number) {
    try {
      const res = await fetch(`/api/environment?lat=${lat}&lng=${lng}`);
      if (!res.ok) return;
      const data = await res.json();
      setReading(data.reading);
    } catch {
      // Network failure — keep showing the last known reading.
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
  const [recentDestinations, setRecentDestinations] = useState<{ label: string; lat: number; lng: number }[]>([]);

  // Recent destinations can be anywhere the rider has actually searched
  // and ridden to — not just the 4 hand-authored demo cities — so this
  // stores each one's real coordinate from its own saved route geometry,
  // rather than re-deriving it from the (Klang-Valley-only) procedural
  // fallback route table.
  function refreshRecentDestinations() {
    getAllTrips()
      .then((trips) => {
        const seen = new Set<string>();
        const recents: { label: string; lat: number; lng: number }[] = [];
        for (const t of trips) {
          if (seen.has(t.destinationLabel) || recents.length >= 3) continue;
          const points = t.selectedRoute.geometry ?? t.selectedRoute.waypoints;
          const last = points[points.length - 1];
          if (!last) continue;
          seen.add(t.destinationLabel);
          recents.push({ label: t.destinationLabel, lat: last.lat, lng: last.lng });
        }
        setRecentDestinations(recents);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refreshRecentDestinations();
  }, []);

  // --- Routes ---
  const [rideState, setRideState] = useState<RideState>("setup");
  const [candidates, setCandidates] = useState<CandidateRoute[]>([]);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<RouteProfile>("balanced");
  const [sheetState, setSheetState] = useState<SheetState>("collapsed");

  // Everything past the search screen takes over the full viewport — the
  // map/navigation experience is meant to feel immersive, with the normal
  // app chrome (bottom tab bar) reappearing once the user is back to
  // picking a destination or has finished their ride.
  useEffect(() => {
    setImmersive(rideState !== "setup");
    return () => setImmersive(false);
  }, [rideState, setImmersive]);

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
          speed: pos.coords.speed !== null ? pos.coords.speed * 3.6 : null,
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

  const [, forceTick] = useState(0);
  useEffect(() => {
    if (rideState !== "riding") return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [rideState]);

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
        setRouteError("We couldn't find a route for that destination. Please try again.");
        setRideState("setup");
        return;
      }
      setCandidates(data.routes);
      setDestination(dest);
      setSelectedProfile("balanced");
      setSheetState("expanded");
      setRideState("comparing");
    } catch {
      setRouteError("Connection lost. Please check your network and try again.");
      setRideState("setup");
    }
  }

  function requestStartRide() {
    if (gpsState === "tracking") {
      startRide();
    } else {
      setRideState("permission");
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

  function resumeRide() {
    startLocationTracking();
    setRideState("riding");
  }

  function pauseRide() {
    stopLocationTracking();
    setRideState("paused");
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
  const cumulativeExposure = currentPm25 * (elapsedMin / 60);
  const exposureLevel = classifyPm25(currentPm25);

  const selectedRoute = candidates.find((c) => c.profile === selectedProfile);
  const fastestRoute = candidates.find((c) => c.profile === "fastest");
  const remainingKm = selectedRoute ? Math.max(0, selectedRoute.distanceKm - observedDistanceKm) : 0;
  const remainingMin = selectedRoute ? Math.max(0, Math.round(selectedRoute.travelTimeMin * (remainingKm / (selectedRoute.distanceKm || 1)))) : 0;

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
        ((selectedRoute.predictedExposure - lowExposureRoute.predictedExposure) / selectedRoute.predictedExposure) * 100
      );
      setWarning(`${reduction}|${lowExposureRoute.travelTimeMin - selectedRoute.travelTimeMin}`);
    }
  }, [observedDistanceKm, rideState, candidates, selectedRoute]);

  function takeAlternative() {
    const lowExposureRoute = candidates.find((c) => c.profile === "low_exposure");
    if (lowExposureRoute) {
      setSelectedProfile(lowExposureRoute.profile);
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
    setLastSavedTripId(trip.id);
  }

  const [lastSavedTripId, setLastSavedTripId] = useState<string | null>(null);

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
    setLastSavedTripId(null);
    setSheetState("collapsed");
    refreshRecentDestinations();
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
      ? [{ id: "observed", positions: trajectory.map((p) => [p.latitude, p.longitude] as [number, number]), color: "#f59e0b", weight: 5, dashArray: "2 6" }]
      : [];

  // ============================================================
  // SETUP — the "Home" screen: search-first, no map, no jargon.
  // ============================================================
  if (rideState === "setup") {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Exposure-Aware Navigation</h1>
          <p className="mt-1 text-sm text-slate-500">Find the route with the cleanest air, not just the fastest one.</p>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGeocode()}
            placeholder="Where are you going?"
            className="h-14 w-full rounded-2xl border border-slate-300 bg-white pl-12 pr-24 text-base shadow-sm"
          />
          <Button
            size="sm"
            onClick={handleGeocode}
            disabled={searching || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>

        {geocodeResults.length > 0 && (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {geocodeResults.map((r) => (
              <button
                key={`${r.lat}-${r.lng}`}
                onClick={() => fetchRoutesFor(r)}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left text-[15px] hover:bg-slate-50 active:bg-slate-100"
              >
                <MapPin className="h-5 w-5 shrink-0 text-slate-400" />
                {r.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Locate className="h-4 w-4 text-[var(--brand)]" />
          Current location: <span className="font-medium text-slate-800">{ORIGIN_LABEL}</span>
        </div>

        {recentDestinations.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent</p>
            <div className="flex flex-wrap gap-2">
              {recentDestinations.map((d) => (
                <button
                  key={d.label}
                  onClick={() => fetchRoutesFor(d)}
                  className="min-h-[44px] rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Popular destinations</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_DESTINATIONS.map((d) => (
              <button
                key={d.label}
                onClick={() => fetchRoutesFor(d)}
                className="min-h-[44px] rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {routeError && (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{routeError}</p>
        )}
      </div>
    );
  }

  // ============================================================
  // LOADING ROUTES — brief, full-screen, no technical detail.
  // ============================================================
  if (rideState === "loading_routes") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand)]" />
        <p className="text-sm text-slate-500">Finding your best routes…</p>
      </div>
    );
  }

  // ============================================================
  // PERMISSION — explain why location is needed before the native
  // browser prompt fires, per the mobile GPS UX spec.
  // ============================================================
  if (rideState === "permission") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--brand)]/10">
          <Locate className="h-8 w-8 text-[var(--brand)]" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Use your location</h2>
        <p className="max-w-xs text-sm text-slate-500">
          Your location is used to track your journey and provide route recommendations. It&apos;s
          only collected while you&apos;re riding.
        </p>
        <Button size="lg" onClick={startRide} className="mt-2 w-full max-w-xs">
          Allow location
        </Button>
        <button onClick={() => setRideState("comparing")} className="min-h-[44px] px-4 text-sm text-slate-400">
          Not now
        </button>
      </div>
    );
  }

  // ============================================================
  // SUMMARY — post-trip screen.
  // ============================================================
  if (rideState === "summary" && selectedRoute && fastestRoute) {
    const reductionPct = Math.round(
      ((fastestRoute.predictedExposure - selectedRoute.predictedExposure) / (fastestRoute.predictedExposure || 1)) * 100
    );
    return (
      <div className="mx-auto flex max-h-dvh max-w-lg flex-col items-center gap-5 overflow-y-auto px-2 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Trip completed</h1>

        <div className="flex gap-8">
          <div>
            <div className="text-3xl font-bold text-slate-900">{elapsedMin.toFixed(0)}</div>
            <div className="text-xs text-slate-400">minutes</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-900">{observedDistanceKm.toFixed(1)}</div>
            <div className="text-xs text-slate-400">km</div>
          </div>
        </div>

        {reductionPct !== 0 && (
          <div className="w-full max-w-xs rounded-2xl bg-emerald-50 px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Estimated exposure</p>
            <p className="text-3xl font-bold text-emerald-700">
              {reductionPct > 0 ? `${reductionPct}% lower` : "Same as fastest"}
            </p>
            <p className="text-xs text-emerald-700/80">compared with the fastest route</p>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Wind className="h-4 w-4 text-slate-400" />
          Air quality: <span className="font-medium">{AirQualityWord(exposureLevel)}</span>
        </div>

        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
          {lastSavedTripId ? (
            <Button size="lg" onClick={() => router.push(`/trip-details/${lastSavedTripId}`)}>
              View trip
            </Button>
          ) : (
            <Button size="lg" onClick={saveAndFinish}>
              Save trip
            </Button>
          )}
          <Button size="lg" variant="ghost" onClick={resetAll}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  // ============================================================
  // COMPARING / RIDING / PAUSED — full-screen map + bottom sheet.
  // ============================================================
  const isNavigating = rideState === "riding" || rideState === "paused";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-100">
      <div className="safe-top absolute inset-x-0 top-0 z-[1000] flex items-center justify-between px-4 py-3">
        {isNavigating ? (
          <div className="rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-slate-800 shadow-md">
            Riding to {destination?.label}
          </div>
        ) : (
          <button
            onClick={() => {
              setRideState("setup");
              setCandidates([]);
              setSheetState("collapsed");
            }}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/95 px-4 text-sm font-medium text-slate-700 shadow-md"
          >
            ← Back
          </button>
        )}
        <GpsBadge state={gpsState} />
      </div>

      <LeafletMap
        heightClass="h-full"
        center={mapCenter}
        zoom={13}
        fitToContent={!isNavigating}
        polylines={[...routePolylines, ...trajectoryPolyline]}
        markers={destination ? [{ id: "dest", lat: destination.lat, lng: destination.lng, color: "#0f172a", radius: 10 }] : []}
        riderPosition={position ? { lat: position.lat, lng: position.lng } : null}
      />

      {isNavigating && selectedRoute ? (
        <NavigationBottomBar
          remainingMin={remainingMin}
          remainingKm={remainingKm}
          exposureLevel={exposureLevel}
          currentPm25={currentPm25}
          warning={warning}
          onDismissWarning={() => setWarning(null)}
          onTakeAlternative={takeAlternative}
          paused={rideState === "paused"}
          onPauseResume={rideState === "paused" ? resumeRide : pauseRide}
          onEndRide={stopRide}
        />
      ) : (
        <BottomSheet
          state={sheetState}
          onStateChange={setSheetState}
          peek={
            selectedRoute && (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-slate-900">
                    {selectedRoute.travelTimeMin} min <span className="font-normal text-slate-400">· {selectedRoute.distanceKm} km</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-[var(--brand-dark)]">
                    {(() => {
                      const Icon = PROFILE_META[selectedRoute.profile].icon;
                      return <Icon className="h-3.5 w-3.5" />;
                    })()}
                    {PROFILE_META[selectedRoute.profile].label}
                  </div>
                </div>
                {sheetState === "collapsed" && (
                  <Button size="sm" onClick={requestStartRide}>
                    Start ride
                  </Button>
                )}
              </div>
            )
          }
        >
          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {candidates.length} route{candidates.length !== 1 ? "s" : ""}
            </p>
            {candidates.map((c) => {
              const Icon = PROFILE_META[c.profile].icon;
              const isSelected = c.profile === selectedProfile;
              const pctVsFastest = fastestRoute
                ? Math.round(((fastestRoute.predictedExposure - c.predictedExposure) / (fastestRoute.predictedExposure || 1)) * 100)
                : 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedProfile(c.profile)}
                  className={cn(
                    "flex w-full min-h-[76px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors",
                    isSelected ? "border-[var(--brand)] bg-[var(--brand)]/5" : "border-slate-200"
                  )}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: PROFILE_COLORS[c.profile] }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-800">{PROFILE_META[c.profile].label}</div>
                    <div className="text-base font-bold text-slate-900">
                      {c.travelTimeMin} min <span className="text-sm font-normal text-slate-400">· {c.distanceKm} km</span>
                    </div>
                    <div className={cn("text-xs font-medium", pctVsFastest > 0 ? "text-emerald-700" : "text-slate-500")}>
                      {pctVsFastest > 0 ? `↓ ${pctVsFastest}% estimated exposure` : c.profile === "fastest" ? "Higher estimated exposure" : "Same estimated exposure"}
                    </div>
                  </div>
                </button>
              );
            })}
            <Button size="lg" className="mt-2 w-full" onClick={requestStartRide}>
              Start ride
            </Button>
            <p className="pt-1 text-center text-[11px] text-slate-400">
              Please interact with the app only when it is safe to do so.
            </p>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function GpsBadge({ state }: { state: GpsState }) {
  if (state === "tracking") {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-md">
        <span className="h-2 w-2 rounded-full bg-emerald-500" /> GPS active
      </div>
    );
  }
  if (state === "denied" || state === "unsupported") {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-rose-700 shadow-md">
        <span className="h-2 w-2 rounded-full bg-rose-500" /> GPS unavailable
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-amber-700 shadow-md">
      <span className="h-2 w-2 rounded-full bg-amber-500" /> GPS accuracy low
    </div>
  );
}

function NavigationBottomBar({
  remainingMin,
  remainingKm,
  exposureLevel,
  currentPm25,
  warning,
  onDismissWarning,
  onTakeAlternative,
  paused,
  onPauseResume,
  onEndRide,
}: {
  remainingMin: number;
  remainingKm: number;
  exposureLevel: "Low" | "Moderate" | "High";
  currentPm25: number;
  warning: string | null;
  onDismissWarning: () => void;
  onTakeAlternative: () => void;
  paused: boolean;
  onPauseResume: () => void;
  onEndRide: () => void;
}) {
  const [reductionStr, timeDeltaStr] = warning ? warning.split("|") : [null, null];

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-[1000] mx-auto w-full max-w-lg space-y-2 px-3 pb-3">
      {warning && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-lg">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> Higher pollution ahead
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Alternative route: {Number(timeDeltaStr) > 0 ? `+${timeDeltaStr} min` : "similar time"} · ↓{reductionStr}% estimated
            exposure
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 bg-white" onClick={onDismissWarning}>
              Stay
            </Button>
            <Button size="sm" className="flex-1" onClick={onTakeAlternative}>
              Alternative
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white p-4 shadow-[0_-4px_24px_rgba(15,23,42,0.15)]">
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold text-slate-900">{remainingMin} min</div>
          <div className="text-lg font-semibold text-slate-500">{remainingKm.toFixed(1)} km</div>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-slate-500">
            <Wind className="h-4 w-4" /> Air quality
          </span>
          <span className="font-medium text-slate-800">
            {AirQualityWord(exposureLevel)} ({currentPm25} µg/m³)
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onPauseResume}>
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="danger" className="flex-1" onClick={onEndRide}>
            <Square className="h-4 w-4" /> End ride
          </Button>
        </div>
      </div>
    </div>
  );
}
