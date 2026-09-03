import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import type { ExposureLevel } from "@/lib/types";

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}

const LEVEL_STYLES: Record<ExposureLevel, string> = {
  Low: "text-emerald-700 bg-emerald-50 border-emerald-200",
  Moderate: "text-amber-700 bg-amber-50 border-amber-200",
  High: "text-rose-700 bg-rose-50 border-rose-200",
};

export function ExposureBadge({ level }: { level: ExposureLevel }) {
  return <Badge className={LEVEL_STYLES[level]}>{level}</Badge>;
}
