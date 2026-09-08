"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, ExposureBadge } from "@/components/ui/Badge";
import { StatTile } from "@/components/ui/StatTile";
import { EnvironmentalModeBadge } from "@/components/ui/EnvironmentalModeBadge";
import { LeafletMap } from "@/components/map/LeafletMap";
import { BASE_ROUTES } from "@/lib/baseRoutes";
import { resampleRoute, type ResampledPoint } from "@/lib/geo";
import { segmentDose, sumExposure, classifyTripExposure } from "@/lib/exposure";
import { MAP_CENTER, ROAD_TYPE_LABELS, TRAFFIC_LEVEL_LABELS } from "@/lib/constants";
import type { EnvironmentalReading, PointTrafficReading } from "@/lib/types";
import { MapPin, Navigation, Play, Square, Satellite, Loader2 } from "lucide-react";

const ANIMATION_STEPS = 90;
const STEP_MS = 180;
const ASSUMED_SPEED_KMH = 27;
// Real environmental/traffic data is fetched for a coarser set of points
// along the route (not once per animation frame) — the same "bounded
// samples along the route" approach used for live PM2.5/traffic elsewhere
// (see lib/liveTraffic.ts), so starting a demo ride costs a fixed, small
// number of real API calls regardless of ANIMATION_STEPS.
const DATA_SAMPLE_COUNT = 16;

type GeoState = "idle" | "requesting" | "tracking" | "denied";

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
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [geoPos, setGeoPos] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [routeId, setRouteId] = useState(BASE_ROUTES[0].id);
  const [rideState, setRideState] = useState<"idle" | "loading" | "playing" | "finished">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [doses, setDoses] = useState<number[]>([]);
  const [readings, setReadings] = useState<EnvironmentalReading[]>([]);
  const [trafficReadings, setTrafficReadings] = useState<PointTrafficReading[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const route = useMemo(
    () => BASE_ROUTES.find((r) => r.id === routeId) ?? BASE_ROUTES[0],
    [routeId]
  );

  const resampled = useMemo<ResampledPoint[]>(
    () => resampleRoute(route.waypoints, ANIMATION_STEPS),
    [route]
  );

  // A coarser sample set than `resampled` — see DATA_SAMPLE_COUNT.
  const dataPoints = useMemo<ResampledPoint[]>(
    () => resampleRoute(route.waypoints, DATA_SAMPLE_COUNT),
    [route]
  );

  const stepDistanceKm = route.distanceKm / (resampled.length - 1 || 1);
  const stepDurationHours = stepDistanceKm / ASSUMED_SPEED_KMH;

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
        Promise.all(dataPoints.map((p) => fetchTrafficReading(p.lat, p.lng, hour, p.roadType))),
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

  function stopDemoRide() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRideState("idle");
    setStepIndex(0);
    setDoses([]);
    setReadings([]);
    setTrafficReadings([]);
    setDataError(null);
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
  const distanceCoveredKm = Math.min(
    route.distanceKm,
    stepDistanceKm * stepIndex
  );
  const elapsedMin = (distanceCoveredKm / ASSUMED_SPEED_KMH) * 60;

  const isDemoMode = geoState !== "tracking";

  const polylines = [
    {
      id: "route",
      positions: resampled.map((p) => [p.lat, p.lng] as [number, number]),
      color: "#0e6e63",
      weight: 4,
    },
  ];
  const markers = [
    { id: "start", lat: route.waypoints[0].lat, lng: route.waypoints[0].lng, color: "#0e6e63", radius: 10 },
    {
      id: "end",
      lat: route.waypoints[route.waypoints.length - 1].lat,
      lng: route.waypoints[route.waypoints.length - 1].lng,
      color: "#334155",
      radius: 10,
    },
  ];

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
          Sense location and estimate real-time environmental exposure while
          riding.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Rider location"
            subtitle="Browser geolocation, with automatic fallback to demo GPS"
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
                riderPosition ? [riderPosition.lat, riderPosition.lng] : MAP_CENTER
              }
              zoom={13}
              polylines={rideState !== "idle" ? polylines : []}
              markers={rideState !== "idle" ? markers : []}
              riderPosition={riderPosition}
              fitToContent={rideState === "idle"}
              heightClass="h-full"
            />
          </CardBody>
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
              subtitle="Real PM2.5 + traffic data fetched for points along a fixed demo path — only the ride's motion/timing is simulated"
            />
            <CardBody className="space-y-3">
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                disabled={rideState === "playing" || rideState === "loading"}
              >
                {BASE_ROUTES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={startDemoRide}
                  disabled={rideState === "playing" || rideState === "loading"}
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
              {dataError && <p className="text-xs text-rose-600">{dataError}</p>}
            </CardBody>
          </Card>
        </div>
      </div>

      {(rideState === "playing" || rideState === "finished") && currentSample && (
        <Card>
          <CardHeader
            title="Ride exposure telemetry"
            subtitle={
              rideState === "finished"
                ? "Ride complete"
                : `${route.name} — in progress`
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
                Road: {ROAD_TYPE_LABELS[currentPoint.roadType]}
              </Badge>
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
