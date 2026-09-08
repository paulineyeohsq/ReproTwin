"use client";

import { useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LeafletMap } from "@/components/map/LeafletMap";
import type { TrafficSamplePoint } from "@/lib/liveTraffic";
import { Info } from "lucide-react";

// Presentation-only bands over the same currentSpeed/freeFlowSpeed ratio
// lib/liveTraffic.ts uses for the exposure model's 3-level TrafficLevel —
// a finer 4-band gradient reads better on a map than 3 flat colours.
const RATIO_BANDS = [
  { min: 0.85, label: "Free-flowing", color: "#4a6b53" },
  { min: 0.65, label: "Light", color: "#6b8f6f" },
  { min: 0.45, label: "Moderate", color: "#c28b38" },
  { min: -Infinity, label: "Heavy", color: "#a84338" },
] as const;

function bandFor(ratio: number) {
  return RATIO_BANDS.find((b) => ratio >= b.min) ?? RATIO_BANDS[RATIO_BANDS.length - 1];
}

export function TrafficDataMapClient({
  samples,
  configured,
}: {
  samples: TrafficSamplePoint[];
  configured: boolean;
}) {
  const [selected, setSelected] = useState<TrafficSamplePoint | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Malaysia Traffic Data</h1>
          <p className="mt-1 text-sm text-slate-500">
            Live per-road speed via TomTom&apos;s traffic map, plus a nationwide snapshot at major cities.
          </p>
        </div>
        {(configured || samples.length > 0) && (
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Live traffic data</Badge>
        )}
      </div>

      {!configured && (
        <Card>
          <CardBody className="flex items-start gap-2 text-sm text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p>
              A nationwide traffic snapshot needs a live source configured (TOMTOM_API_KEY). No live
              source is configured for this deployment, so nothing is shown here — see System Status for
              details. This page never shows a fabricated map.
            </p>
          </CardBody>
        </Card>
      )}

      {configured && samples.length === 0 && (
        <Card>
          <CardBody className="text-sm text-slate-500">
            The nationwide city-sample snapshot below isn&apos;t available right now (the live source may
            be temporarily unreachable) — the traffic map above is unaffected. Try again shortly.
          </CardBody>
        </Card>
      )}

      {configured && (
        <Card>
          <CardHeader
            title="Live traffic map"
            subtitle="Real per-road current-vs-free-flow speed, straight from TomTom's Flow Tiles — green is free-flowing, red/dark red is heavy congestion. Pan and zoom anywhere in Malaysia; defaults to Klang Valley (LDP/Federal Highway/NKVE)."
          />
          <CardBody className="h-[60vh] min-h-[420px] p-0">
            <LeafletMap center={[3.06, 101.58]} zoom={11} trafficTileUrl="/api/traffic-tile/{z}/{x}/{y}" />
          </CardBody>
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--card-border)] px-5 py-2.5 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: "#4ade80" }} /> Free-flowing
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: "#facc15" }} /> Moderate
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: "#f97316" }} /> Slow
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: "#dc2626" }} /> Heavy
            </span>
            <span className="text-slate-400">— TomTom&apos;s own colour scale, per road segment</span>
          </div>
        </Card>
      )}

      {samples.length > 0 && (
        <>
          <Card>
            <CardHeader
              title={`${samples.length} sampled locations`}
              subtitle="Tap a marker for detail — attribution: TomTom Traffic API. Fixed city-centre points, not a real-time station network — TomTom has no bulk nationwide endpoint (see System Status)."
            />
            <CardBody className="h-[60vh] min-h-[420px] p-0">
              <LeafletMap
                center={[3.8, 109.5]}
                zoom={5}
                markers={samples.map((s) => {
                  const band = bandFor(s.ratio);
                  return {
                    id: s.label,
                    lat: s.lat,
                    lng: s.lng,
                    color: band.color,
                    radius: 12,
                    label: `${Math.round(s.ratio * 100)}%`,
                    live: true,
                    popup: (
                      <div className="text-xs">
                        <div className="font-semibold">{s.label}</div>
                        <div>
                          {Math.round(s.ratio * 100)}% of free-flow speed ({band.label})
                        </div>
                        <div className="text-slate-400">
                          {s.currentSpeedKmh} km/h current · {s.freeFlowSpeedKmh} km/h free-flow
                        </div>
                      </div>
                    ),
                  };
                })}
              />
            </CardBody>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 border-t border-[var(--card-border)] px-5 py-2.5 text-xs text-slate-500">
              {RATIO_BANDS.map((b) => (
                <span key={b.label} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} /> {b.label}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="All locations" subtitle="Sorted by congestion, worst first" />
            <CardBody className="max-h-96 overflow-y-auto p-0">
              <div className="divide-y divide-slate-100">
                {[...samples]
                  .sort((a, b) => a.ratio - b.ratio)
                  .map((s) => {
                    const band = bandFor(s.ratio);
                    return (
                      <button
                        key={s.label}
                        onClick={() => setSelected(s)}
                        className="flex w-full min-h-[56px] items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: band.color }} />
                        <span className="flex-1 truncate text-sm text-slate-700">{s.label}</span>
                        <span className="text-sm font-semibold text-slate-900">{Math.round(s.ratio * 100)}%</span>
                      </button>
                    );
                  })}
              </div>
            </CardBody>
          </Card>

          {selected && (
            <Card>
              <CardHeader title={selected.label} subtitle={`${bandFor(selected.ratio).label} traffic`} />
              <CardBody className="text-sm text-slate-600">
                {selected.currentSpeedKmh} km/h current vs {selected.freeFlowSpeedKmh} km/h free-flow (
                {Math.round(selected.ratio * 100)}%) · Source: TomTom Traffic API
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
