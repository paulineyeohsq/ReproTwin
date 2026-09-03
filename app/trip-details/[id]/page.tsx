"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { LeafletMap } from "@/components/map/LeafletMap";
import { MAP_CENTER } from "@/lib/constants";
import { getTripById, type RecordedTrip } from "@/lib/tripStore";
import { cn } from "@/lib/cn";
import { ArrowLeft } from "lucide-react";

export default function TripDetailsPage() {
  const params = useParams<{ id: string }>();
  const [trip, setTrip] = useState<RecordedTrip | null | undefined>(undefined);

  useEffect(() => {
    if (!params.id) return;
    getTripById(params.id)
      .then(setTrip)
      .catch(() => setTrip(null));
  }, [params.id]);

  if (trip === undefined) {
    return <p className="text-sm text-slate-400">Loading trip…</p>;
  }
  if (trip === null) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-600">Trip not found in this browser&apos;s local storage.</p>
        <Link href="/trip-history" className="text-sm text-[var(--brand-dark)] underline">
          Back to Trip History
        </Link>
      </div>
    );
  }

  const observedPositions = trip.observedTrajectory.map((p) => [p.latitude, p.longitude] as [number, number]);
  const routeGeometry = trip.selectedRoute.geometry ?? trip.selectedRoute.waypoints;
  const fastest = trip.routeComparison.find((c) => c.profile === "fastest");
  const reductionPct =
    fastest && fastest.predictedExposure > 0
      ? Math.round(((fastest.predictedExposure - trip.selectedRoute.predictedExposure) / fastest.predictedExposure) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <Link href="/trip-history" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to Trip History
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {trip.originLabel} → {trip.destinationLabel}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {new Date(trip.startedAt).toLocaleString("en-MY")} · {trip.selectedRoute.label} route
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3 text-center">
          <div className="text-xs text-slate-400">Distance</div>
          <div className="text-xl font-bold text-slate-900">{trip.distanceKm} km</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-center">
          <div className="text-xs text-slate-400">Duration</div>
          <div className="text-xl font-bold text-slate-900">{trip.durationMin} min</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-center">
          <div className="text-xs text-slate-400">Avg speed</div>
          <div className="text-xl font-bold text-slate-900">{trip.avgSpeedKmh} km/h</div>
        </div>
        <div className="rounded-lg bg-[var(--brand)]/5 p-3 text-center">
          <div className="text-xs text-slate-400">Est. exposure</div>
          <div className="text-xl font-bold text-[var(--brand-dark)]">{trip.estimatedExposure}</div>
        </div>
      </div>

      <Card>
        <CardHeader title="Route map" subtitle="Observed trajectory (dashed) vs recommended route (solid)" />
        <CardBody className="h-[420px] p-0">
          <LeafletMap
            center={MAP_CENTER}
            zoom={12}
            fitToContent
            polylines={[
              { id: "route", positions: routeGeometry.map((w) => [w.lat, w.lng] as [number, number]), color: "#64748b", weight: 4 },
              ...(observedPositions.length > 1
                ? [{ id: "observed", positions: observedPositions, color: "#f59e0b", weight: 5, dashArray: "2 6" }]
                : []),
            ]}
          />
        </CardBody>
        <div className="flex flex-wrap gap-3 border-t border-[var(--card-border)] px-5 py-2.5 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-slate-500" /> Recommended route
          </span>
          {observedPositions.length > 1 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-amber-500" /> Observed trajectory (actual GPS)
            </span>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Route comparison" subtitle="Offered at ride start" />
        <CardBody className="overflow-x-auto">
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
              {trip.routeComparison.map((c) => (
                <tr
                  key={c.id}
                  className={cn(
                    "border-b border-slate-100 last:border-0",
                    c.profile === trip.selectedProfile && "bg-slate-50 font-medium"
                  )}
                >
                  <td className="py-1.5 pr-3">
                    {c.label}
                    {c.profile === trip.selectedProfile && " (selected)"}
                  </td>
                  <td className="py-1.5 pr-3">{c.travelTimeMin} min</td>
                  <td className="py-1.5 pr-3">{c.distanceKm} km</td>
                  <td className="py-1.5">{c.predictedExposure}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {fastest && (
            <p className="mt-2 text-xs text-slate-500">
              Exposure reduction vs fastest route:{" "}
              <span className="font-semibold text-emerald-700">{reductionPct}%</span>
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Environmental conditions" />
        <CardBody className="space-y-2">
          {trip.environmentalSnapshots.map((s, i) => (
            <div key={i} className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">{s.pm25} µg/m³ PM2.5</span>
                <span className="text-xs text-slate-400">{s.source}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                As of {s.timestamp}
                {s.stale && " — not live, no live environmental API configured"}
              </p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
