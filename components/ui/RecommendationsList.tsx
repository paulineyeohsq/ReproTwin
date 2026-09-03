import { Lightbulb } from "lucide-react";
import type { Recommendation } from "@/lib/recommendations";

export function RecommendationsList({ items }: { items: Recommendation[] }) {
  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id} className="flex gap-3 rounded-lg bg-slate-50 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {r.title}
            </p>
            <p className="mt-0.5 text-sm text-slate-700">{r.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
