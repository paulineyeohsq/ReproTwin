"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, ExposureBadge } from "@/components/ui/Badge";
import { StatTile } from "@/components/ui/StatTile";
import { LeafletMap } from "@/components/map/LeafletMap";
import { BASE_ROUTES } from "@/lib/baseRoutes";
import { resampleRoute, type ResampledPoint } from "@/lib/geo";
import {
  inferTrafficLevel,
  sampleWeather,
  samplePollutants,
} from "@/lib/environment";
import { segmentDose, sumExposure, classifyTripExposure } from "@/lib/exposure";
import { mulberry32 } from "@/lib/rng";
import { MAP_CENTER, ROAD_TYPE_LABELS, TRAFFIC_LEVEL_LABELS } from "@/lib/constants";
import { MapPin, Navigation, Play, Square, Satellite } from "lucide-react";

const ANIMATION_STEPS = 90;
const STEP_MS = 180;
const ASSUMED_SPEED_KMH = 27;

type GeoState = "idle" | "requesting" | "tracking" | "denied";

export function LiveExposureClient() {
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [geoPos, setGeoPos] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [routeId, setRouteId] = useState(BASE_ROUTES[0].id);
  const [rideState, setRideState] = useState<"idle" | "playing" | "finished">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [doses, setDoses] = useState<number[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rngRef = useRef(mulberry32(1));
  const hourRef = useRef(18);

  const route = useMemo(
    () => BASE_ROUTES.find((r) => r.id === routeId) ?? BASE_ROUTES[0],
    [routeId]
  );

  const resampled = useMemo<ResampledPoint[]>(
    () => resampleRoute(route.waypoints, ANIMATION_STEPS),
    [route]
  );

  const stepDistanceKm = route.distanceKm / (resampled.length - 1 || 1);
  const stepDurationHours = stepDistanceKm / ASSUMED_SPEED_KMH;

  const currentPoint = resampled[Math.min(stepIndex, resampled.length - 1)];
  const currentSample = useMemo(() => {
    if (!currentPoint) return null;
    const trafficLevel = inferTrafficLevel(hourRef.current, currentPoint.roadType, rngRef.current);
    const weather = sampleWeather(hourRef.current, rngRef.current);
    const { pm25, pm10, no2 } = samplePollutants(
      hourRef.current,
      currentPoint.roadType,
      trafficLevel,
      weather.wind_speed,
      rngRef.current
    );
    return { trafficLevel, pm25, pm10, no2, weather };
  }, [currentPoint]);

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

  function startDemoRide() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    rngRef.current = mulberry32(Date.now() & 0xffffffff);
    hourRef.current = new Date().getHours();
    // Keep the simulated hour within the rider's typical commute peaks
    // (07:00-09:00 or 17:00-20:00) so the environmental model reflects
    // realistic rush-hour conditions.
    const inMorningPeak = hourRef.current >= 7 && hourRef.current < 9;
    const inEveningPeak = hourRef.current >= 17 && hourRef.current < 20;
    if (!inMorningPeak && !inEveningPeak) hourRef.current = 18;
    setStepIndex(0);
    setDoses([]);
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
  }

  // Accumulate dose whenever the current sample changes during playback.
  useEffect(() => {
    if (rideState !== "playing" || !currentSample) return;
    setDoses((prev) => [
      ...prev,
      segmentDose(currentSample.pm25, stepDurationHours),
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
            <CardHeader title="Demo ride" />
            <CardBody className="space-y-3">
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                disabled={rideState === "playing"}
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
                  disabled={rideState === "playing"}
                >
                  <Play className="h-3.5 w-3.5" /> Start Demo Ride
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
            </CardBody>
          </Card>
        </div>
      </div>

      {rideState !== "idle" && currentSample && (
        <Card>
          <CardHeader
            title="Ride exposure telemetry"
            subtitle={
              rideState === "finished"
                ? "Ride complete"
                : `${route.name} — in progress`
            }
          />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatTile label="PM2.5" value={currentSample.pm25} unit="µg/m³" />
              <StatTile label="PM10" value={currentSample.pm10} unit="µg/m³" />
              <StatTile label="NO2" value={currentSample.no2} unit="ppb" />
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
              </Badge>
              <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                Simulated hour: {hourRef.current}:00
              </Badge>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
