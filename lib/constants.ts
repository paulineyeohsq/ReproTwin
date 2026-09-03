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
