"use client";

import dynamic from "next/dynamic";

// react-leaflet touches `window` at import time, so it must never be
// server-rendered.
export const LeafletMap = dynamic(
  () => import("./LeafletMapInner").then((m) => m.LeafletMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400">
        Loading map…
      </div>
    ),
  }
);
