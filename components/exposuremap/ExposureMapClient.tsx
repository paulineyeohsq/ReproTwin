"use client";

import { useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { FreshnessLabel } from "@/components/ui/FreshnessLabel";
import { LeafletMap } from "@/components/map/LeafletMap";
import { MAP_CENTER } from "@/lib/constants";
import { classifyPm25 } from "@/lib/exposure";
import type { WaqiHistoricalAverage } from "@/lib/liveEnvironment";
import type { Hotspot, DataProvenance, EnvironmentalReading } from "@/lib/types";

const LEVEL_COLORS = { Low: "#059669", Moderate: "#d97706", High: "#e11d48" } as const;

function levelForHotspot(h: Hotspot, thresholds: { low: number; high: number }): "Low" | "Moderate" | "High" {
  if (h.avgPm25 < thresholds.low) return "Low";
  if (h.avgPm25 < thresholds.high) return "Moderate";
  return "High";
}

export function ExposureMapClient({
  hotspots,
  provenance,
  liveReadings,
  waqiHistoricals,
}: {
  hotspots: Hotspot[];
  provenance: DataProvenance;
  liveReadings: Record<string, EnvironmentalReading>;
  waqiHistoricals: Record<string, WaqiHistoricalAverage>;
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
                const historicalLevel = levelForHotspot(h, thresholds);
                const live = liveReadings[h.id];
                // Only flag a marker as "live" when a real source (live or
                // historical-station) actually resolved — never for the
                // synthetic fallback, which would misrepresent demo data as
                // a real-time reading.
                const isReal = live && live.mode !== "synthetic" && live.pm25 !== null;
                const displayLevel = isReal ? classifyPm25(live.pm25 as number) : historicalLevel;

                return {
                  id: h.id,
                  lat: h.latitude,
                  lng: h.longitude,
                  color: LEVEL_COLORS[displayLevel],
                  radius: 14 + (hotspots.length - i) * 2,
                  label: isReal ? `${live.pm25}` : undefined,
                  live: isReal,
                  popup: (
                    <div className="text-xs">
                      <div className="font-semibold">{h.label}</div>
                      <div>Historical avg PM2.5: {h.avgPm25} µg/m³ ({historicalLevel})</div>
                      <div>Visits: {h.visits}</div>
                      {isReal && (
                        <div className="mt-1 border-t border-slate-200 pt-1 font-medium text-rose-700">
                          Right now: {live.pm25} µg/m³ ({displayLevel}) — {live.mode === "live" ? "live" : "historical"} reading
                        </div>
                      )}
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
            <span className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-600" /> 91
              </span>
              = live/historical reading available right now (colour reflects that reading, not the historical average)
            </span>
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
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-800">{h.label}</span>
                  {liveReadings[h.id] && liveReadings[h.id].mode !== "synthetic" && liveReadings[h.id].pm25 !== null && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-600" /> {liveReadings[h.id].pm25} now
                    </span>
                  )}
                </div>
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
              <>
                <p className="text-xs text-slate-400">
                  &quot;PM2.5&quot;/&quot;Avg exposure&quot; above are based on nearest available
                  monitoring/modelled data, aggregated across all recorded visits to this location in
                  the loaded dataset (an exposure statistic — Source: {provenance.environmentSource}).
                </p>
                {liveReadings[selected.id] && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Right now at this location
                    </p>
                    <FreshnessLabel reading={liveReadings[selected.id]} />
                  </div>
                )}
                {waqiHistoricals[selected.id] && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      WAQI recent-days average (not tied to trip visits)
                    </p>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-semibold text-slate-900">
                        {waqiHistoricals[selected.id].avgPm25} µg/m³
                      </span>
                      <span className="text-xs text-slate-500">PM2.5</span>
                    </div>
                    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <dt>Days averaged:</dt>
                      <dd className="text-slate-700">
                        {waqiHistoricals[selected.id].dayCount} ({waqiHistoricals[selected.id].days[0]} to{" "}
                        {waqiHistoricals[selected.id].days[waqiHistoricals[selected.id].days.length - 1]})
                      </dd>
                      <dt>Station:</dt>
                      <dd className="text-slate-700">
                        {waqiHistoricals[selected.id].stationName}
                        {waqiHistoricals[selected.id].distanceKm !== undefined &&
                          ` (${waqiHistoricals[selected.id].distanceKm} km away)`}
                      </dd>
                      <dt>Source:</dt>
                      <dd className="text-slate-700">{waqiHistoricals[selected.id].source}</dd>
                    </dl>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      WAQI&apos;s own past-days average for this station — a general air-quality
                      trend, not an average of this rider&apos;s actual visits (that&apos;s the PM2.5
                      figure above).
                    </p>
                  </div>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
