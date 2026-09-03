"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { cn } from "@/lib/cn";
import { ArrowRight } from "lucide-react";
import type { DataProvenance } from "@/lib/types";

const WINDOW_PRESETS = {
  current: {
    label: "07:00–09:00 & 17:00–20:00 (current, peak)",
    ranges: [
      [7, 9],
      [17, 20],
    ],
  },
  shifted: { label: "10:00–16:00 (off-peak)", ranges: [[10, 16]] },
} as const;

type WindowKey = keyof typeof WINDOW_PRESETS;
type RoutePreference = "current" | "low_exposure";

function windowAverage(profile: number[], ranges: readonly (readonly [number, number])[]): number {
  let sum = 0;
  let count = 0;
  for (const [start, end] of ranges) {
    for (let h = start; h < end; h++) {
      sum += profile[h % 24];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

export function SimulatorClient({
  hourlyProfile,
  workingDaysLast90,
  lowExposureDiscount,
  observedRidingHours,
  provenance,
}: {
  hourlyProfile: number[];
  workingDaysLast90: number;
  lowExposureDiscount: number;
  observedRidingHours: number;
  provenance: DataProvenance;
}) {
  const [ridingHours, setRidingHours] = useState(observedRidingHours);
  const [windowKey, setWindowKey] = useState<WindowKey>("current");
  const [routePref, setRoutePref] = useState<RoutePreference>("current");

  const daysPerWeekFraction = workingDaysLast90 / 90;

  function estimate(hours: number, win: WindowKey, pref: RoutePreference) {
    const avgPm25 = windowAverage(hourlyProfile, WINDOW_PRESETS[win].ranges);
    const multiplier = pref === "low_exposure" ? lowExposureDiscount : 1;
    const dailyExposure = avgPm25 * hours * multiplier;
    return Math.round(dailyExposure * 90 * daysPerWeekFraction * 10) / 10;
  }

  // Observed baseline: the rider's *observed* riding pattern (current
  // riding hours, current peak-hour travel window, current route mix) run
  // through the same estimator as the modelled scenario, so the two are
  // directly comparable and neither silently mixes real with synthetic.
  const observedBaselineExposure = useMemo(
    () => estimate(observedRidingHours, "current", "current"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [observedRidingHours]
  );
  const simulatedExposure = useMemo(
    () => estimate(ridingHours, windowKey, routePref),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ridingHours, windowKey, routePref]
  );

  const pctChange =
    observedBaselineExposure === 0
      ? 0
      : Math.round(
          ((simulatedExposure - observedBaselineExposure) / observedBaselineExposure) * 100
        );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            What-If Simulator
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Simulate Scenario A (current route), Scenario B (lower-exposure
            routes) and Scenario C (travel outside peak traffic periods) to
            estimate the change in 90-day cumulative exposure.
          </p>
        </div>
        <SourceBadge source={provenance.environmentSource} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Scenario controls" />
          <CardBody className="space-y-6">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <label className="font-medium text-slate-700">
                  Daily riding hours
                </label>
                <span className="font-mono text-slate-500">{ridingHours}h</span>
              </div>
              <input
                type="range"
                min={1}
                max={6}
                step={0.5}
                value={ridingHours}
                onChange={(e) => setRidingHours(Number(e.target.value))}
                className="w-full accent-[var(--brand)]"
              />
              <div className="flex justify-between text-xs text-slate-400">
                <span>1h</span>
                <span>6h</span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                Scenario C — travel timing
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(WINDOW_PRESETS) as WindowKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setWindowKey(key)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      windowKey === key
                        ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand-dark)]"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {WINDOW_PRESETS[key].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                Scenario A / B — route choice
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setRoutePref("current")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    routePref === "current"
                      ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand-dark)]"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  A · Current route
                </button>
                <button
                  onClick={() => setRoutePref("low_exposure")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    routePref === "low_exposure"
                      ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand-dark)]"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  B · Lower-exposure routes
                </button>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Modelled estimate" subtitle="Not a measured outcome" />
          <CardBody className="space-y-4">
            <StatTile
              label="Observed baseline"
              value={observedBaselineExposure.toLocaleString()}
              unit="units / 90 days"
              hint="Current route · observed riding pattern"
            />
            <div className="flex items-center justify-center text-slate-300">
              <ArrowRight className="h-4 w-4" />
            </div>
            <StatTile
              label="Modelled scenario"
              value={simulatedExposure.toLocaleString()}
              unit="units / 90 days"
              className="border-[var(--brand)]/30"
              hint="Simulated — not observed"
            />
            <div
              className={cn(
                "rounded-lg p-3 text-center text-sm font-semibold",
                pctChange < 0
                  ? "bg-emerald-50 text-emerald-700"
                  : pctChange > 0
                  ? "bg-rose-50 text-rose-700"
                  : "bg-slate-50 text-slate-600"
              )}
            >
              {pctChange === 0
                ? "No estimated change"
                : `${Math.abs(pctChange)}% ${pctChange < 0 ? "lower" : "higher"} modelled exposure`}
            </div>
            <p className="text-xs text-slate-400">
              Modelled scenario — an illustrative estimate, not a measured or
              observed outcome, and not a health-risk reduction figure.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
