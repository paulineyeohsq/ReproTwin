// Accumulates real environmental snapshots over time into Netlify Blobs,
// so a genuinely real historical dataset builds up for future model
// retraining (see README.md's "Environmental data investigation" — this is
// "option 2": accumulate what the app already fetches live, rather than
// waiting on an official DOE researcher-data grant).
//
// Why Netlify Blobs and not a local file: this app runs on Netlify as a
// serverless function per request (see the Next.js Runtime in netlify.toml)
// — there is no persistent local filesystem between invocations, so
// anything written to disk during a request would vanish before the next
// one. Blobs is Netlify's own persistent key-value store and — critically —
// auto-configures with zero extra credentials when called from code that is
// itself running inside a Netlify Function (which every Route Handler in
// this app is, once deployed). It does NOT work from a plain `next dev`
// process or an external script with no Netlify execution context; every
// function here fails closed (returns "unavailable") rather than throwing,
// and never fabricates snapshot data if storage isn't reachable.
//
// Respecting WAQI's terms: only the small derived fields actually needed
// (station name/coords/AQI/timestamp) are stored — never a raw feed dump —
// consistent with the "no caching/archiving of the raw feed" posture used
// throughout lib/liveEnvironment.ts.

import { getStore, type Store } from "@netlify/blobs";
import { fetchMalaysiaStations, type MalaysiaStation } from "./liveEnvironment";

const STORE_NAME = "environmental-history";
const KEY_PREFIX = "snapshot-";

export interface EnvironmentalSnapshotRecord {
  collectedAt: string; // ISO
  stations: MalaysiaStation[];
}

export interface CollectionStatus {
  available: boolean;
  snapshotCount: number;
  firstCollectedAt: string | null;
  lastCollectedAt: string | null;
}

function tryGetStore(): Store | null {
  try {
    return getStore(STORE_NAME);
  } catch {
    return null; // no Netlify Blobs context available in this environment
  }
}

function keyFor(iso: string): string {
  return `${KEY_PREFIX}${iso}`;
}

async function listSnapshotKeys(store: Store): Promise<string[]> {
  const result = await store.list({ prefix: KEY_PREFIX });
  return result.blobs.map((b) => b.key).sort(); // ISO keys sort chronologically
}

// Fetches one real nationwide snapshot and stores it. Called by
// app/api/collect-snapshot/route.ts, which an external scheduler (this
// repo's GitHub Actions cron — see .github/workflows/) triggers every few
// hours. Never invents a snapshot: returns ok:false if the live fetch or
// the store itself is unavailable.
export async function collectSnapshot(): Promise<{ ok: boolean; stationCount: number; reason?: string }> {
  const stations = await fetchMalaysiaStations();
  if (stations.length === 0) {
    return { ok: false, stationCount: 0, reason: "No live station data available (source not configured or unreachable)" };
  }

  const store = tryGetStore();
  if (!store) {
    return { ok: false, stationCount: 0, reason: "Blob storage unavailable in this environment" };
  }

  const collectedAt = new Date().toISOString();
  const record: EnvironmentalSnapshotRecord = { collectedAt, stations };
  await store.setJSON(keyFor(collectedAt), record);

  return { ok: true, stationCount: stations.length };
}

export async function getCollectionStatus(): Promise<CollectionStatus> {
  const store = tryGetStore();
  if (!store) {
    return { available: false, snapshotCount: 0, firstCollectedAt: null, lastCollectedAt: null };
  }
  try {
    const keys = await listSnapshotKeys(store);
    if (keys.length === 0) {
      return { available: true, snapshotCount: 0, firstCollectedAt: null, lastCollectedAt: null };
    }
    return {
      available: true,
      snapshotCount: keys.length,
      firstCollectedAt: keys[0].slice(KEY_PREFIX.length),
      lastCollectedAt: keys[keys.length - 1].slice(KEY_PREFIX.length),
    };
  } catch {
    return { available: false, snapshotCount: 0, firstCollectedAt: null, lastCollectedAt: null };
  }
}

// For future retraining use — reads every accumulated snapshot back out.
// Not called anywhere in the UI yet; this is the read side a future
// "retrain on real data" script would use.
export async function getAllSnapshots(): Promise<EnvironmentalSnapshotRecord[]> {
  const store = tryGetStore();
  if (!store) return [];
  try {
    const keys = await listSnapshotKeys(store);
    const records = await Promise.all(keys.map((k) => store.get(k, { type: "json" }) as Promise<EnvironmentalSnapshotRecord | null>));
    return records.filter((r): r is EnvironmentalSnapshotRecord => r !== null);
  } catch {
    return [];
  }
}
