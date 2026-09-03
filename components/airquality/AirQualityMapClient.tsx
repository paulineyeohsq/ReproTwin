"use client";

import { useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { EnvironmentalModeBadge } from "@/components/ui/EnvironmentalModeBadge";
import { LeafletMap } from "@/components/map/LeafletMap";
import type { MalaysiaStation } from "@/lib/liveEnvironment";
import { Info } from "lucide-react";

// Standard US EPA AQI bands — this is the composite Air Quality Index
// WAQI's bulk station endpoint returns (not this app's own PM2.5-µg/m³
// 3-tier scale used elsewhere), so it gets its own distinct legend/colours
// rather than being forced into classifyPm25's categories.
const AQI_BANDS = [
  { max: 50, label: "Good", color: "#059669" },
  { max: 100, label: "Moderate", color: "#d97706" },
  { max: 150, label: "Unhealthy (sensitive groups)", color: "#ea580c" },
  { max: 200, label: "Unhealthy", color: "#dc2626" },
  { max: 300, label: "Very unhealthy", color: "#7e22ce" },
  { max: Infinity, label: "Hazardous", color: "#7f1d1d" },
] as const;

function bandFor(aqi: number) {
  return AQI_BANDS.find((b) => aqi <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" });
}

export function AirQualityMapClient({
  stations,
  configured,
}: {
  stations: MalaysiaStation[];
  configured: boolean;
}) {
  const [selected, setSelected] = useState<MalaysiaStation | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Malaysia Air Quality</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every currently-reporting DOE/JAS monitoring station nationwide, live.
          </p>
        </div>
        {stations.length > 0 && <EnvironmentalModeBadge mode="live" />}
      </div>

      {!configured && (
        <Card>
          <CardBody className="flex items-start gap-2 text-sm text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p>
              A nationwide live map needs a live data source configured (WAQI_TOKEN). No live source
              is configured for this deployment, so nothing is shown here — see System Status for
              details. This page never shows a fabricated map.
            </p>
          </CardBody>
        </Card>
      )}

      {configured && stations.length === 0 && (
        <Card>
          <CardBody className="text-sm text-slate-500">
            No station data available right now (the live source may be temporarily unreachable).
            Try again shortly.
          </CardBody>
        </Card>
      )}

      {stations.length > 0 && (
        <>
          <Card>
            <CardHeader
              title={`${stations.length} reporting stations`}
              subtitle="Tap a marker for detail — attribution: World Air Quality Index (aqicn.org), source stations: Malaysia DOE/JAS"
            />
            <CardBody className="h-[60vh] min-h-[420px] p-0">
              <LeafletMap
                center={[3.8, 109.5]}
                zoom={5}
                markers={stations.map((s) => {
                  const band = bandFor(s.aqi);
                  return {
                    id: s.name,
                    lat: s.lat,
                    lng: s.lng,
                    color: band.color,
                    radius: 12,
                    label: String(s.aqi),
                    live: true,
                    popup: (
                      <div className="text-xs">
                        <div className="font-semibold">{s.name}</div>
                        <div>
                          AQI {s.aqi} ({band.label})
                        </div>
                        <div className="text-slate-400">As of {formatTime(s.observedAt)}</div>
                      </div>
                    ),
                  };
                })}
              />
            </CardBody>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 border-t border-[var(--card-border)] px-5 py-2.5 text-xs text-slate-500">
              {AQI_BANDS.map((b) => (
                <span key={b.label} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} /> {b.label}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="All stations" subtitle="Sorted by AQI, highest first" />
            <CardBody className="max-h-96 overflow-y-auto p-0">
              <div className="divide-y divide-slate-100">
                {[...stations]
                  .sort((a, b) => b.aqi - a.aqi)
                  .map((s) => {
                    const band = bandFor(s.aqi);
                    return (
                      <button
                        key={s.name}
                        onClick={() => setSelected(s)}
                        className="flex w-full min-h-[56px] items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: band.color }} />
                        <span className="flex-1 truncate text-sm text-slate-700">{s.name}</span>
                        <span className="text-sm font-semibold text-slate-900">{s.aqi}</span>
                      </button>
                    );
                  })}
              </div>
            </CardBody>
          </Card>

          {selected && (
            <Card>
              <CardHeader title={selected.name} subtitle={`As of ${formatTime(selected.observedAt)}`} />
              <CardBody className="text-sm text-slate-600">
                AQI {selected.aqi} ({bandFor(selected.aqi).label}) · Source: DOE/JAS via World Air Quality
                Index (WAQI) aggregator — attribution: aqicn.org
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
