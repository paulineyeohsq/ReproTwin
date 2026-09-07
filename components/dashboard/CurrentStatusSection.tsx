"use client";

import { useEffect, useState } from "react";
import { EnvironmentalModeBadge } from "@/components/ui/EnvironmentalModeBadge";
import { StatTile } from "@/components/ui/StatTile";
import { ExposureBadge } from "@/components/ui/Badge";
import { FreshnessLabel } from "@/components/ui/FreshnessLabel";
import { classifyPm25 } from "@/lib/exposure";
import { formatExposureValue } from "@/lib/format";
import { ORIGIN_LABEL, RIDER } from "@/lib/constants";
import type { EnvironmentalReading } from "@/lib/types";
import { Wind, Timer, Gauge, CalendarRange, MapPin } from "lucide-react";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

// app/page.tsx is a Server Component: it only re-fetches the "current
// conditions" reading when Next re-renders the page on a fresh request,
// after its own 5-minute revalidate window — a dashboard tab left open
// never sees a fresher PM2.5 reading on its own. This client component
// keeps the live reading current by re-polling /api/environment on a
// fixed 30-minute timer for as long as the tab stays open, independent of
// page navigation or Next's own revalidation.
export function CurrentStatusSection({
  initialReading,
  lat,
  lng,
  todaysRidingHours,
  todaysExposure,
  ninetyDayExposure,
  asOfDate,
}: {
  initialReading: EnvironmentalReading;
  lat: number;
  lng: number;
  todaysRidingHours: number;
  todaysExposure: number;
  ninetyDayExposure: number | null;
  asOfDate: string;
}) {
  const [reading, setReading] = useState(initialReading);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/environment?lat=${lat}&lng=${lng}`);
        if (!res.ok) return;
        const data = await res.json();
        setReading(data.reading);
      } catch {
        // Network failure — keep showing the last known reading, never
        // fabricate a fresher-looking one.
      }
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [lat, lng]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Current status</h2>
        <EnvironmentalModeBadge mode={reading.mode} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Current location"
          value={ORIGIN_LABEL}
          unit={RIDER.city.split(",")[0]}
          icon={<MapPin className="h-4 w-4 text-slate-400" />}
        />
        <StatTile
          label="Current PM2.5"
          value={reading.pm25 ?? "—"}
          unit="µg/m³"
          icon={<Wind className="h-4 w-4 text-slate-400" />}
          hint={reading.pm25 !== null ? <ExposureBadge level={classifyPm25(reading.pm25)} /> : "Unavailable"}
        />
        <StatTile
          label="Today's riding"
          value={todaysRidingHours}
          unit="hours"
          icon={<Timer className="h-4 w-4 text-slate-400" />}
          hint={`As of ${asOfDate}`}
        />
        <StatTile
          label="Today's exposure"
          value={todaysExposure}
          unit="units"
          icon={<Gauge className="h-4 w-4 text-slate-400" />}
          hint="Estimated exposure — prototype index"
        />
        <StatTile
          label="90-day exposure"
          value={formatExposureValue(ninetyDayExposure)}
          unit={ninetyDayExposure === null ? undefined : "units"}
          icon={<CalendarRange className="h-4 w-4 text-slate-400" />}
          hint={ninetyDayExposure === null ? "Insufficient real data for this window" : "Cumulative, rolling window"}
        />
      </div>
      <div className="mt-3 max-w-md">
        <FreshnessLabel reading={reading} />
      </div>
    </div>
  );
}
