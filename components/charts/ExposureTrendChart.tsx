"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn } from "@/lib/cn";
import type { DailyAggregate } from "@/lib/dataAccess";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

export function ExposureTrendChart({ data }: { data: DailyAggregate[] }) {
  const [range, setRange] = useState<Range>(30);

  const sliced = useMemo(() => {
    const s = data.slice(-range);
    return s.map((d) => ({
      ...d,
      dateLabel: d.date.slice(5),
    }));
  }, [data, range]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              range === r
                ? "bg-[var(--brand)] text-white"
                : "text-slate-500 hover:bg-slate-100"
            )}
          >
            {r}d
          </button>
        ))}
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={sliced} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e6ec" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 11, fill: "#64748b" }}
              interval={range === 90 ? 10 : range === 30 ? 3 : 0}
              axisLine={{ stroke: "#e2e6ec" }}
              tickLine={false}
            />
            <YAxis
              yAxisId="exposure"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <YAxis
              yAxisId="hours"
              orientation="right"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e6ec",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              yAxisId="exposure"
              dataKey="exposure"
              name="Daily exposure (units)"
              fill="#0e6e63"
              radius={[3, 3, 0, 0]}
              maxBarSize={18}
            />
            <Line
              yAxisId="hours"
              type="monotone"
              dataKey="ridingHours"
              name="Riding hours"
              stroke="#d97706"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
