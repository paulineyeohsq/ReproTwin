// Small curated landmark list used only to give human-readable labels to
// computed exposure hotspots (nearest-landmark lookup) — not a geocoding
// service.
export const LANDMARKS: { name: string; lat: number; lng: number }[] = [
  { name: "Petaling Jaya (SS2)", lat: 3.1073, lng: 101.6067 },
  { name: "Jalan Templer", lat: 3.1104, lng: 101.6209 },
  { name: "Federal Highway (PJ)", lat: 3.1256, lng: 101.6389 },
  { name: "Federal Highway (KL-bound)", lat: 3.1373, lng: 101.6586 },
  { name: "Kuala Lumpur City Centre", lat: 3.1478, lng: 101.6953 },
  { name: "LDP – Kelana Jaya", lat: 3.0951, lng: 101.5985 },
  { name: "LDP – Subang Interchange", lat: 3.0793, lng: 101.5904 },
  { name: "Subang Jaya", lat: 3.0567, lng: 101.5851 },
  { name: "Jalan Damansara", lat: 3.114, lng: 101.628 },
  { name: "Jalan Kerinchi", lat: 3.122, lng: 101.652 },
  { name: "Bangsar", lat: 3.1286, lng: 101.6767 },
  { name: "Federal Highway (Shah Alam-bound)", lat: 3.0862, lng: 101.562 },
  { name: "Persiaran Kewajipan", lat: 3.079, lng: 101.539 },
  { name: "Shah Alam", lat: 3.0733, lng: 101.5185 },
];

export function nearestLandmarkLabel(lat: number, lng: number): string {
  let best = LANDMARKS[0];
  let bestDist = Infinity;
  for (const l of LANDMARKS) {
    const d = (l.lat - lat) ** 2 + (l.lng - lng) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = l;
    }
  }
  return best.name;
}
