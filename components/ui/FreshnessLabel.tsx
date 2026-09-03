import type { EnvironmentalReading } from "@/lib/types";
import { EnvironmentalModeBadge } from "./EnvironmentalModeBadge";

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

// Renders the observation/retrieval timestamp pair the spec requires
// everywhere a pollutant reading is shown — deliberately never uses the
// word "real-time"; a genuinely fresh live reading still shows both
// timestamps so the reader can judge freshness themselves.
export function FreshnessLabel({ reading, pollutant = "PM2.5" }: { reading: EnvironmentalReading; pollutant?: string }) {
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-semibold text-slate-900">
          {reading.pm25 ?? "—"} µg/m³
        </span>
        <span className="text-slate-500">{pollutant}</span>
      </div>
      <EnvironmentalModeBadge mode={reading.mode} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-slate-500">
        <dt>Environmental observation:</dt>
        <dd className="text-slate-700">{formatTime(reading.observedAt)}</dd>
        <dt>Retrieved:</dt>
        <dd className="text-slate-700">{formatTime(reading.retrievedAt)}</dd>
        <dt>Source:</dt>
        <dd className="text-slate-700">{reading.source}</dd>
        {reading.stationName && (
          <>
            <dt>Station:</dt>
            <dd className="text-slate-700">
              {reading.stationName}
              {reading.distanceKm !== undefined && ` (${reading.distanceKm} km away)`}
            </dd>
          </>
        )}
        <dt>Measurement:</dt>
        <dd className="text-slate-700">
          {reading.measurement === "measured" ? "Measured" : "Estimated from monitoring data"}
        </dd>
      </dl>
    </div>
  );
}
