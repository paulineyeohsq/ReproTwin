"use client";

// Trip persistence for rides recorded via the Navigate page's real device
// GPS. Backed by the browser's IndexedDB — a real structured database, not
// a flat localStorage blob — chosen because no Supabase project is
// connected in this environment. The interface below is intentionally
// small and storage-agnostic so a server-backed implementation (Supabase)
// can be dropped in later without touching any caller: every function here
// is async and returns plain data, exactly as a network-backed store would.

import type { RouteProfile, CandidateRoute } from "./types";

export interface GpsObservation {
  timestamp: string;
  latitude: number;
  longitude: number;
  speed: number | null; // km/h
  heading: number | null; // degrees
  accuracy: number | null; // metres
  altitude: number | null; // metres
}

export interface EnvironmentalSnapshot {
  timestamp: string;
  pm25: number;
  pm10: number | null;
  no2: number | null;
  source: string;
  stale: boolean;
}

export interface RecordedTrip {
  id: string;
  startedAt: string;
  endedAt: string | null;
  originLabel: string;
  destinationLabel: string;
  selectedProfile: RouteProfile;
  selectedRoute: CandidateRoute;
  routeComparison: CandidateRoute[]; // all candidates offered at ride start
  observedTrajectory: GpsObservation[];
  environmentalSnapshots: EnvironmentalSnapshot[];
  distanceKm: number;
  durationMin: number;
  avgSpeedKmh: number;
  estimatedExposure: number;
  avgPm25: number;
  maxPm25: number;
  highExposureMinutes: number;
  routeChanges: number;
}

const DB_NAME = "repotwin-trips";
const DB_VERSION = 1;
const STORE_NAME = "trips";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTrip(trip: RecordedTrip): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(trip);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllTrips(): Promise<RecordedTrip[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () =>
      resolve((req.result as RecordedTrip[]).sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
    req.onerror = () => reject(req.error);
  });
}

export async function getTripById(id: string): Promise<RecordedTrip | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as RecordedTrip) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTrip(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function newTripId(): string {
  return `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
