import { Radar, Cpu, Route, LineChart, FlaskConical, ClipboardList } from "lucide-react";

const STEPS = [
  { label: "Sense", icon: Radar, desc: "Location + context" },
  { label: "Predict", icon: Cpu, desc: "AI exposure estimate" },
  { label: "Optimise", icon: Route, desc: "Compare routes" },
  { label: "Monitor", icon: LineChart, desc: "Cumulative exposure" },
  { label: "Simulate", icon: FlaskConical, desc: "Alternative behaviours" },
  { label: "Recommend", icon: ClipboardList, desc: "Exposure-reduction actions" },
];

export function WorkflowStrip() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {STEPS.map((s, i) => (
        <div
          key={s.label}
          className="flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-white px-3 py-2.5"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--brand)]/10 text-[var(--brand-dark)]">
            <s.icon className="h-3.5 w-3.5" />
          </span>
          <div className="leading-tight">
            <div className="text-xs font-semibold text-slate-800">
              {i + 1}. {s.label}
            </div>
            <div className="text-[10px] text-slate-500">{s.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
