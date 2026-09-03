"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/cn";
import type { HealthRecord } from "@/lib/types";

const METRICS = [
  { key: "resting_hr", label: "Resting HR", unit: "bpm", color: "#dc2626" },
  { key: "hrv", label: "HRV", unit: "ms", color: "#2563eb" },
  { key: "sleep_duration", label: "Sleep", unit: "h", color: "#7c3aed" },
] as const;

export function PhysiologyTrendChart({ data }: { data: HealthRecord[] }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("resting_hr");
  const active = METRICS.find((m) => m.key === metric)!;

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: d.date.slice(5),
        value: d[metric],
      })),
    [data, metric]
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              metric === m.key
                ? "bg-[var(--brand)] text-white"
                : "text-slate-500 hover:bg-slate-100"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e6ec" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#64748b" }}
              interval={9}
              axisLine={{ stroke: "#e2e6ec" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              width={36}
              domain={["auto", "auto"]}
            />
            <Tooltip
              formatter={(v) => [`${String(v)} ${active.unit}`, active.label] as [string, string]}
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e6ec", fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={active.color}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
