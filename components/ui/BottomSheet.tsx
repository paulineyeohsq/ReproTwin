"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SheetState = "collapsed" | "expanded";

// A draggable bottom sheet: tap the handle to toggle, or drag it up/down
// past a small threshold. Deliberately simple (no physics/momentum) so it
// works reliably with plain pointer events rather than a gesture library.
export function BottomSheet({
  state,
  onStateChange,
  peek,
  children,
  className,
}: {
  state: SheetState;
  onStateChange: (next: SheetState) => void;
  /** Always-visible summary row, shown above the expanded content. */
  peek: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const startY = useRef<number | null>(null);

  function onPointerDown(e: PointerEvent) {
    startY.current = e.clientY;
  }
  function onPointerUp(e: PointerEvent) {
    if (startY.current === null) return;
    const delta = e.clientY - startY.current;
    startY.current = null;
    if (delta > 36) onStateChange("collapsed");
    else if (delta < -36) onStateChange("expanded");
    else onStateChange(state === "expanded" ? "collapsed" : "expanded");
  }

  return (
    <div
      className={cn(
        "safe-bottom fixed inset-x-0 bottom-0 z-[1000] mx-auto w-full max-w-lg rounded-t-2xl border-t border-[var(--card-border)] bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.15)] transition-[max-height] duration-300 ease-out",
        state === "expanded" ? "max-h-[80vh]" : "max-h-[124px]",
        className
      )}
      role="region"
      aria-label="Route details"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="flex w-full cursor-grab touch-none flex-col items-center py-2 active:cursor-grabbing"
        role="button"
        tabIndex={0}
        aria-label={state === "expanded" ? "Collapse route details" : "Expand route details"}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onStateChange(state === "expanded" ? "collapsed" : "expanded");
        }}
      >
        <span className="h-1.5 w-10 rounded-full bg-slate-300" />
      </div>
      <div className="px-4 pb-2">{peek}</div>
      {state === "expanded" && children && (
        <div className="max-h-[calc(80vh-64px)] overflow-y-auto px-4 pb-6">{children}</div>
      )}
    </div>
  );
}
