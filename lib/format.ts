// Renders a window-exposure value that may be null (real mode, insufficient
// temporal coverage) without ever silently showing 0 or a stale number.
export function formatExposureValue(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString();
}

export const INSUFFICIENT_DATA_NOTE = "Insufficient real data for this exposure window.";
