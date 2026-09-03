"use client";

import { useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { ExposureBadge } from "@/components/ui/Badge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { LeafletMap } from "@/components/map/LeafletMap";
import { MAP_CENTER } from "@/lib/constants";
import { cn } from "@/lib/cn";
import type { TripSummary } from "@/lib/dataAccess";
import type { DataProvenance } from "@/lib/types";
import type { ResolvedStationSummary } from "@/lib/realDataEngine";
import { MyRidesTab } from "./MyRidesTab";
import { List, Navigation } from "lucide-react";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  // timeZone must be pinned explicitly — this renders server-side (trips
  // come as props from a Server Component) and again on hydration; without
  // a fixed zone the two can disagree whenever the server's system
  // timezone differs from the visitor's browser, causing a React
  // hydration mismatch (see components/ui/FreshnessLabel.tsx).
  return d.toLocaleString("en-MY", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  });
}

export function TripHistoryClient({
  trips,
  provenance,
  stations,
}: {
  trips: TripSummary[];
  provenance: DataProvenance;
  stations: ResolvedStationSummary[];
}) {
  const [tab, setTab] = useState<"trips" | "my-rides">("trips");
  const [selectedTripId, setSelectedTripId] = useState(trips[0]?.id ?? null);
  const isReal = provenance.mode === "real";

  const selectedTrip = trips.find((t) => t.id === selectedTripId) ?? trips[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Trip History
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isReal
              ? "Real observed trajectories from the loaded real dataset, and rides you've recorded yourself."
              : "Most recent recorded rides from the demo dataset, and rides you've recorded yourself."}
          </p>
        </div>
        <SourceBadge source={provenance.mobilitySource} />
      </div>

      {isReal && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Real urban mobility trajectory data — not attributed to any
          specific delivery platform or, unless the source dataset says
          otherwise, to motorcycles specifically.
        </p>
      )}

      <div className="flex gap-1">
        <button
          onClick={() => setTab("trips")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "trips"
              ? "bg-[var(--brand)] text-white"
              : "text-slate-500 hover:bg-slate-100"
          )}
        >
          <List className="h-3.5 w-3.5" /> Trip list
        </button>
        <button
          onClick={() => setTab("my-rides")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "my-rides"
              ? "bg-[var(--brand)] text-white"
              : "text-slate-500 hover:bg-slate-100"
          )}
        >
          <Navigation className="h-3.5 w-3.5" /> My rides
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Looking for the spatial exposure hotspot map? See{" "}
        <a href="/exposure-map" className="underline hover:text-slate-600">
          Exposure Map
        </a>
        .
      </p>

      {tab === "trips" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Last 20 trips"
              subtitle="Click a row to preview its route"
            />
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pl-5 pr-3">Date</th>
                    <th className="py-2 pr-3">Route</th>
                    <th className="py-2 pr-3">Duration</th>
                    <th className="py-2 pr-3">Distance</th>
                    <th className="py-2 pr-3">Avg PM2.5</th>
                    <th className="py-2 pr-3">Exposure</th>
                    <th className="py-2 pr-5">Avg HR</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTripId(t.id)}
                      className={cn(
                        "cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50",
                        selectedTripId === t.id && "bg-slate-50"
                      )}
                    >
                      <td className="py-2.5 pl-5 pr-3 text-slate-600">
                        {formatDateTime(t.startTime)}
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-slate-800">
                        {t.routeName}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{t.durationMin} min</td>
                      <td className="py-2.5 pr-3 text-slate-600">{t.distanceKm} km</td>
                      <td className="py-2.5 pr-3 text-slate-600">{t.avgPm25} µg/m³</td>
                      <td className="py-2.5 pr-3">
                        <ExposureBadge level={t.exposureLevel} />
                      </td>
                      <td className="py-2.5 pr-5 text-slate-600">{t.avgHr} bpm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={selectedTrip?.routeName ?? "Route preview"}
              subtitle={selectedTrip ? formatDateTime(selectedTrip.startTime) : undefined}
            />
            <CardBody className="h-[360px] p-0">
              {selectedTrip && (
                <LeafletMap
                  center={MAP_CENTER}
                  zoom={12}
                  fitToContent
                  polylines={[
                    {
                      id: selectedTrip.id,
                      positions: selectedTrip.waypoints.map(
                        (w) => [w.latitude, w.longitude] as [number, number]
                      ),
                      color: "#0e6e63",
                      weight: 4,
                    },
                  ]}
                  markers={[
                    {
                      id: "start",
                      lat: selectedTrip.waypoints[0].latitude,
                      lng: selectedTrip.waypoints[0].longitude,
                      color: "#0e6e63",
                    },
                    {
                      id: "end",
                      lat: selectedTrip.waypoints[selectedTrip.waypoints.length - 1].latitude,
                      lng: selectedTrip.waypoints[selectedTrip.waypoints.length - 1].longitude,
                      color: "#334155",
                    },
                    ...(isReal
                      ? stations.map((s) => ({
                          id: `station-${s.location}`,
                          lat: s.lat,
                          lng: s.lng,
                          color: "#2563eb",
                          radius: 10,
                          popup: (
                            <div className="text-xs">
                              <div className="font-semibold">{s.location}</div>
                              <div>{s.readingCount} readings</div>
                              {s.coordinateSource === "approximate-town" && (
                                <div className="text-slate-400">Approximate location</div>
                              )}
                            </div>
                          ),
                        }))
                      : []),
                  ]}
                />
              )}
            </CardBody>
            {isReal && (
              <div className="flex flex-wrap gap-3 border-t border-[var(--card-border)] px-5 py-2.5 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#0e6e63]" /> Real GPS trajectory
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#2563eb]" /> Environmental monitoring station
                </span>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "my-rides" && <MyRidesTab />}
    </div>
  );
}
