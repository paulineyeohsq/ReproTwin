import { Radio, History, FlaskConical } from "lucide-react";
import { cn } from "@/lib/cn";
import type { EnvironmentalMode } from "@/lib/types";

// The three environmental-data modes, using the exact required copy so a
// screenshot of any page always states plainly which kind of number is on
// screen — never implying "live" for historical/synthetic data.
const MODE_META: Record<EnvironmentalMode, { label: string; icon: typeof Radio; className: string }> = {
  live: {
    label: "Live environmental data",
    icon: Radio,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  historical: {
    label: "Historical Malaysian environmental data",
    icon: History,
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  synthetic: {
    label: "Demonstration data — not live environmental observations",
    icon: FlaskConical,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

export function EnvironmentalModeBadge({ mode, className }: { mode: EnvironmentalMode; className?: string }) {
  const meta = MODE_META[mode];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        meta.className,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}
