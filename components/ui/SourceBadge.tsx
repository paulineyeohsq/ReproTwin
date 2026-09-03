import { Database, FlaskConical } from "lucide-react";
import { cn } from "@/lib/cn";

// Small provenance indicator — "Source: OpenDOSM / ..." vs
// "Source: Prototype synthetic dataset" — attached to any real-data-derived
// visualisation so it's immediately clear what's measured vs simulated.
export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const isReal = !source.toLowerCase().includes("synthetic");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium",
        isReal ? "text-emerald-700" : "text-amber-700",
        className
      )}
    >
      {isReal ? <Database className="h-3 w-3" /> : <FlaskConical className="h-3 w-3" />}
      Source: {source}
    </span>
  );
}
