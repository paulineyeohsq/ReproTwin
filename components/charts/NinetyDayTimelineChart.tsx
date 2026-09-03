"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { NinetyDayTimelinePoint } from "@/lib/dataAccess";

export function NinetyDayTimelineChart({ series }: { series: NinetyDayTimelinePoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="cumulativeExposure" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0e6e63" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#0e6e63" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e6ec" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={{ stroke: "#e2e6ec" }}
            tickLine={false}
            ticks={[1, 30, 60, 90]}
            tickFormatter={(d) => `Day ${d}`}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            labelFormatter={(d) => `Day ${d}`}
            formatter={(v) => [`${String(v)} units`, "Cumulative exposure"] as [string, string]}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e6ec", fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="cumulativeExposure"
            stroke="#0e6e63"
            strokeWidth={2}
            fill="url(#cumulativeExposure)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
