import { ChevronDown } from "lucide-react";

export interface ProvenanceStep {
  label: string;
  value: string;
}

// Renders the Route -> Segment -> Station -> Reading -> Timestamp ->
// Exposure-contribution chain as an expandable "Why this exposure?" panel,
// so no exposure number is a black box — every figure can be traced back to
// the observation(s) that produced it.
export function ExposureProvenance({ steps }: { steps: ProvenanceStep[] }) {
  return (
    <details className="group rounded-lg border border-slate-200 bg-slate-50/60 open:bg-slate-50">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium text-slate-600">
        Why this exposure?
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <ol className="space-y-1.5 border-t border-slate-200 px-3 py-2.5 text-xs">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-500">
              {i + 1}
            </span>
            <span>
              <span className="text-slate-400">{step.label}: </span>
              <span className="font-medium text-slate-700">{step.value}</span>
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
