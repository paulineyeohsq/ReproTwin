// Approximate town/city-centre coordinates for common Malaysian air-quality
// monitoring station names (as commonly used by APIMS/CAQM/OpenDOSM
// reporting, e.g. "Petaling Jaya", "Shah Alam", "Batu Muda"). These are
// well-known town-level coordinates, NOT official station metadata and NOT
// precise monitoring-equipment locations — they exist only so a real
// environmental CSV that gives a station name but no latitude/longitude can
// still be placed on the map and spatially matched against GPS trajectories,
// at town-level accuracy. Prefer real lat/lon columns in the source CSV
// whenever they are available; this list is a fallback only.
export const TOWN_ANCHORS: { name: string; lat: number; lng: number }[] = [
  { name: "Petaling Jaya", lat: 3.1073, lng: 101.6067 },
  { name: "Kuala Lumpur", lat: 3.139, lng: 101.6869 },
  { name: "Shah Alam", lat: 3.0733, lng: 101.5185 },
  { name: "Klang", lat: 3.0333, lng: 101.45 },
  { name: "Subang Jaya", lat: 3.0567, lng: 101.5851 },
  { name: "Cheras", lat: 3.1, lng: 101.7333 },
  { name: "Batu Muda", lat: 3.205, lng: 101.68 },
  { name: "Banting", lat: 2.8167, lng: 101.5 },
  { name: "Kajang", lat: 2.9931, lng: 101.7874 },
  { name: "Putrajaya", lat: 2.9264, lng: 101.6964 },
  { name: "Nilai", lat: 2.7969, lng: 101.7969 },
  { name: "Batu Caves", lat: 3.2379, lng: 101.684 },
];

export interface AnchorMatch {
  lat: number;
  lng: number;
  coordinateSource: "approximate-town";
}

// Loose case-insensitive substring match against a station/location string
// (e.g. "CA0043 Petaling Jaya" matches "Petaling Jaya"). Returns null if no
// known town name appears in the string — the caller should treat that
// station as un-locatable rather than guessing.
export function resolveTownAnchor(locationName: string): AnchorMatch | null {
  const normalized = locationName.toLowerCase();
  const match = TOWN_ANCHORS.find((a) => normalized.includes(a.name.toLowerCase()));
  if (!match) return null;
  return { lat: match.lat, lng: match.lng, coordinateSource: "approximate-town" };
}
