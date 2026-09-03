export const PROJECT_TITLE =
  "AI-Powered Digital Twin for Personalised Air Pollution Exposure Management Among Urban Motorcycle Riders";

export const PROJECT_TAGLINE =
  "A research prototype for modelling individual motorcycle travel, estimating air-pollution exposure, optimising lower-exposure routes and monitoring cumulative exposure over time.";

// Default / demo rider — a general urban motorcycle rider (daily commuter),
// not specific to any delivery platform or occupation. Editable at runtime
// via the Rider Profile page (persisted to localStorage) — this is only the
// seed used to generate the synthetic dataset and the out-of-the-box default.
export const RIDER = {
  id: "R001",
  age: 29,
  occupation: "Motorcycle rider (daily commuter)",
  workingHours: "07:00–09:00 and 17:00–20:00",
  avgRidingHoursPerDay: 2.5,
  workingDaysPerWeek: 6,
  city: "Klang Valley, Malaysia",
  restDayOfWeek: 1, // Monday (0 = Sunday) — the rider's one day off
};

// Dataset window: 90 days ending today.
export const DATASET_DAYS = 90;

// Prototype exposure index thresholds (NOT a clinical threshold).
// Three separate scales, because "exposure" is shown at three different
// magnitudes in the UI: a momentary PM2.5 reading, a single trip's
// cumulative dose (pm25 x duration, summed across segments), and a
// window's average daily dose (used for multi-day/90-day totals).
export const PM25_LEVEL_THRESHOLDS = { low: 22, moderate: 30 };
export const TRIP_DOSE_THRESHOLDS = { low: 12, moderate: 24 };
export const DAILY_DOSE_THRESHOLDS = { low: 60, moderate: 75 };

export const ROAD_TYPE_LABELS: Record<string, string> = {
  residential: "Residential",
  arterial: "Major arterial",
  highway: "Highway",
};

export const TRAFFIC_LEVEL_LABELS: Record<string, string> = {
  low: "Low",
  moderate: "Moderate",
  heavy: "Heavy",
};

export const DESTINATIONS = [
  "Kuala Lumpur",
  "Bangsar",
  "Subang Jaya",
  "Shah Alam",
] as const;

export const ORIGIN_LABEL = "Petaling Jaya";

// Nationwide destination chips for the Navigate search screen — real,
// road-reachable Peninsular Malaysian cities across multiple states
// (verified via a real OSRM route request during development). East
// Malaysia (Sabah/Sarawak) is deliberately excluded here: there is no road
// connection across the South China Sea from a Peninsular origin, so OSRM
// correctly returns no route — that's a real geography fact, not an app
// limitation. Live/historical environmental data (WAQI) is confirmed
// working for East Malaysian cities too via direct location search; it's
// only turn-by-turn road routing that's Peninsular-only from this origin.
export const POPULAR_DESTINATIONS = [
  { label: "Kuala Lumpur", lat: 3.139, lng: 101.6869 },
  { label: "Shah Alam", lat: 3.0733, lng: 101.5185 },
  { label: "Subang Jaya", lat: 3.0567, lng: 101.5851 },
  { label: "Seremban", lat: 2.7297, lng: 101.9381 },
  { label: "Malacca City", lat: 2.1896, lng: 102.2501 },
  { label: "Johor Bahru", lat: 1.4927, lng: 103.7414 },
  { label: "Ipoh", lat: 4.5975, lng: 101.0901 },
  { label: "George Town, Penang", lat: 5.4141, lng: 100.3288 },
  { label: "Alor Setar", lat: 6.1184, lng: 100.3685 },
  { label: "Kuantan", lat: 3.8077, lng: 103.326 },
] as const;

export const MAP_CENTER: [number, number] = [3.0967, 101.6317];

export const MOTORCYCLE_TYPES = [
  "Scooter",
  "Underbone",
  "Standard motorcycle",
  "Sport motorcycle",
  "Other",
] as const;

export const FUEL_TYPES = ["Petrol", "Electric", "Other"] as const;

export const TRAVEL_PURPOSES = [
  "Daily commute",
  "Work-related travel",
  "Education",
  "Personal travel",
  "Mixed",
] as const;
