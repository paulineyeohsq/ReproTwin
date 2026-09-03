import { FlaskConical, Database } from "lucide-react";
import type { DataMode, RealDataSummary } from "@/lib/types";

export function DemoBanner({
  mode = "demo",
  realSummary,
}: {
  mode?: DataMode;
  realSummary?: RealDataSummary | null;
}) {
  if (mode === "real" && realSummary) {
    const range = realSummary.dateRange;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-800 sm:px-6">
        <span className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 shrink-0" />
          REAL DATA MODE — real environmental and urban mobility data are
          currently driving the analysis.
        </span>
        <span className="text-emerald-700">
          {realSummary.environmentRecordCount.toLocaleString()} environmental records ·{" "}
          {realSummary.mobilityRecordCount.toLocaleString()} mobility records ·{" "}
          {realSummary.tripCount.toLocaleString()} trajectories
          {range && (
            <> · {range.start.slice(0, 10)} → {range.end.slice(0, 10)}</>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-800 sm:px-6">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      <span>
        DEMO MODE — Synthetic demonstration data are being used. Not real
        measurements. Not for clinical use.
      </span>
    </div>
  );
}
