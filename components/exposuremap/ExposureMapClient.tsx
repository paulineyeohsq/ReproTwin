"use client";

import { useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { LeafletMap } from "@/components/map/LeafletMap";
import { MAP_CENTER } from "@/lib/constants";
import type { Hotspot, DataProvenance } from "@/lib/types";

const LEVEL_COLORS = { Low: "#059669", Moderate: "#d97706", High: "#e11d48" } as const;

function levelForHotspot(h: Hotspot, thresholds: { low: number; high: number }): "Low" | "Moderate" | "High" {
  if (h.avgPm25 < thresholds.low) return "Low";
  if (h.avgPm25 < thresholds.high) return "Moderate";
  return "High";
}

export function ExposureMapClient({
  hotspots,
  provenance,
}: {
  hotspots: Hotspot[];
  provenance: DataProvenance;
}) {
  const [selected, setSelected] = useState<Hotspot | null>(hotspots[0] ?? null);

  const pm25Values = hotspots.map((h) => h.avgPm25);
  const thresholds = {
    low: pm25Values.length ? Math.min(...pm25Values) + (Math.max(...pm25Values) - Math.min(...pm25Values)) * 0.33 : 20,
    high: pm25Values.length ? Math.min(...pm25Values) + (Math.max(...pm25Values) - Math.min(...pm25Values)) * 0.66 : 30,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Exposure Map</h1>
          <p className="mt-1 text-sm text-slate-500">
            Spatial view of estimated air-pollution exposure across recurring locations in the loaded
            dataset, based on the nearest available monitoring/modelled environmental data.
          </p>
        </div>
        <SourceBadge source={provenance.environmentSource} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Exposure hotspots" subtitle="Click a marker for detail" />
          <CardBody className="h-[440px] p-0">
            <LeafletMap
              center={MAP_CENTER}
              zoom={11}
              fitToContent
              markers={hotspots.map((h, i) => {
                const level = levelForHotspot(h, thresholds);
                return {
                  id: h.id,
                  lat: h.latitude,
                  lng: h.longitude,
                  color: LEVEL_COLORS[level],
                  radius: 14 + (hotspots.length - i) * 2,
                  popup: (
                    <div className="text-xs">
                      <div className="font-semibold">{h.label}</div>
                      <div>PM2.5: {h.avgPm25} µg/m³ ({level})</div>
                      <div>Visits: {h.visits}</div>
                    </div>
                  ),
                };
              })}
            />
          </CardBody>
          <div className="flex flex-wrap gap-3 border-t border-[var(--card-border)] px-5 py-2.5 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLORS.Low }} /> Low
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLORS.Moderate }} /> Moderate
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLORS.High }} /> High
            </span>
            <span className="text-slate-400">(3-tier prototype scale; marker size = visit frequency)</span>
          </div>
        </Card>

        <Card>
          <CardHeader title="Location detail" />
          <CardBody className="space-y-3">
            {hotspots.length === 0 && <p className="text-sm text-slate-400">No hotspot data available.</p>}
            {hotspots.map((h) => (
              <button
                key={h.id}
                onClick={() => setSelected(h)}
                className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                  selected?.id === h.id ? "border-[var(--brand)] bg-[var(--brand)]/5" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="font-semibold text-slate-800">{h.label}</div>
                <dl className="mt-1 grid grid-cols-3 gap-2 text-xs text-slate-500">
                  <div>
                    <dt className="text-slate-400">PM2.5</dt>
                    <dd className="font-medium text-slate-700">{h.avgPm25} µg/m³</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Visits</dt>
                    <dd className="font-medium text-slate-700">{h.visits}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Avg exposure</dt>
                    <dd className="font-medium text-slate-700">{h.avgExposure}</dd>
                  </div>
                </dl>
              </button>
            ))}
            {selected && (
              <p className="text-xs text-slate-400">
                Based on nearest available monitoring/modelled data, aggregated across all recorded
                visits to this location in the loaded dataset. Source: {provenance.environmentSource}.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
