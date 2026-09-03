import { nearestLandmarkLabel } from "./landmarks";
import type { Trip, Hotspot } from "./types";

// Bins every trip segment's GPS point into a coarse grid and ranks cells by
// visit count. Shared by the demo-data generator script (to produce the
// static reference file) and dataAccess.ts (to compute hotspots live for
// whichever trip set — synthetic or real — is currently active).
export function computeHotspots(trips: Trip[], limit = 5): Hotspot[] {
  interface Cell {
    latSum: number;
    lngSum: number;
    pm25Sum: number;
    exposureSum: number;
    count: number;
  }
  const cellSize = 0.012; // ~1.3km
  const cells = new Map<string, Cell>();

  for (const trip of trips) {
    for (const seg of trip.segments) {
      const key = `${Math.round(seg.env.latitude / cellSize)}_${Math.round(seg.env.longitude / cellSize)}`;
      const cell = cells.get(key) ?? { latSum: 0, lngSum: 0, pm25Sum: 0, exposureSum: 0, count: 0 };
      cell.latSum += seg.env.latitude;
      cell.lngSum += seg.env.longitude;
      cell.pm25Sum += seg.env.pm25;
      cell.exposureSum += seg.exposure;
      cell.count += 1;
      cells.set(key, cell);
    }
  }

  return Array.from(cells.entries())
    .map(([key, c]) => {
      const lat = c.latSum / c.count;
      const lng = c.lngSum / c.count;
      return {
        id: key,
        label: nearestLandmarkLabel(lat, lng),
        latitude: Math.round(lat * 1e5) / 1e5,
        longitude: Math.round(lng * 1e5) / 1e5,
        avgPm25: Math.round((c.pm25Sum / c.count) * 10) / 10,
        visits: c.count,
        avgExposure: Math.round((c.exposureSum / c.count) * 100) / 100,
      };
    })
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit);
}
