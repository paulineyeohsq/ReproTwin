// Shared data structures for ReproTwin.
// These mirror the "future-ready" standardised schemas described in the spec
// so real GPS/health/environment feeds could later replace the synthetic ones
// without redesigning the app.

export type RoadType = "residential" | "arterial" | "highway";

export type TrafficLevel = "low" | "moderate" | "heavy";

export interface GPSPoint {
  timestamp: string; // ISO 8601
  latitude: number;
  longitude: number;
  speed: number; // km/h
  accuracy?: number; // metres, only present for live browser GPS
}

export interface EnvironmentSample {
  timestamp: string;
  latitude: number;
  longitude: number;
  pm25: number; // ug/m3
  pm10: number; // ug/m3
  no2: number; // ppb
  temperature: number; // celsius
  humidity: number; // %
  wind_speed: number; // km/h
  traffic_level: TrafficLevel;
  road_type: RoadType;
}

export interface HealthRecord {
  date: string; // YYYY-MM-DD
  resting_hr: number; // bpm
  avg_hr: number; // bpm (riding average)
  hrv: number; // ms
  spo2: number; // %
  respiratory_rate: number; // breaths/min
  steps: number;
  sleep_duration: number; // hours
  sleep_score: number; // 0-100
  active_calories: number; // kcal
}

export interface TripSegment {
  point: GPSPoint;
  env: EnvironmentSample;
  durationHours: number; // duration this sample represents
  exposure: number; // pm2.5 x duration dose for this segment
}

export type ExposureLevel = "Low" | "Moderate" | "High";

export interface Trip {
  id: string;
  date: string; // YYYY-MM-DD
  routeName: string;
  startTime: string; // ISO
  endTime: string; // ISO
  durationMin: number;
  distanceKm: number;
  avgSpeed: number;
  avgPm25: number;
  avgPm10: number;
  avgNo2: number;
  avgHr: number;
  exposure: number;
  exposureLevel: ExposureLevel;
  waypoints: GPSPoint[];
  segments: TripSegment[];
  source?: string; // data provenance label; omitted = synthetic demo trip
}

export interface RouteWaypointDef {
  lat: number;
  lng: number;
  roadType: RoadType;
}

export interface BaseRoute {
  id: string;
  name: string;
  origin: string;
  destination: string;
  waypoints: RouteWaypointDef[];
  distanceKm: number;
}

export type RouteProfile = "fastest" | "balanced" | "low_exposure";

export interface CandidateRoute {
  id: string;
  profile: RouteProfile;
  label: string;
  destination: string;
  distanceKm: number;
  travelTimeMin: number;
  predictedExposure: number;
  waypoints: RouteWaypointDef[];
  avgPm25: number;
  avgPm10?: number;
  avgNo2?: number;
  // Full-resolution, real road-following geometry when available (OSRM);
  // falls back to `waypoints` for the map when absent.
  geometry?: { lat: number; lng: number }[];
  // Per-routing-graph-edge exposure detail, for segment colour-coding.
  segments?: {
    lat: number;
    lng: number;
    exposureLevel: ExposureLevel;
  }[];
  roadNetworkSource: string;
}

export interface Hotspot {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  avgPm25: number;
  visits: number;
  avgExposure: number;
}

export interface ModelMetrics {
  mae: number;
  rmse: number;
  r2: number;
  nTrain: number;
  nTest: number;
  trainedAt: string;
}

export interface GBMTreeNode {
  leaf?: number;
  featureIndex?: number;
  threshold?: number;
  left?: GBMTreeNode;
  right?: GBMTreeNode;
}

export interface GBMModel {
  initialValue: number;
  learningRate: number;
  trees: GBMTreeNode[];
  featureNames: string[];
  metrics: ModelMetrics;
}

export type Sex = "Male" | "Female" | "Prefer not to say";

export interface RiderProfile {
  rider_id: string;
  display_name: string;
  age: number;
  sex: Sex;
  height_cm: number;
  weight_kg: number;
  usual_area: string;
  motorcycle_type: string;
  engine_cc: number;
  fuel_type: string;
  riding_experience_years: number;
  average_riding_hours: number; // hours/day
  riding_days_per_week: number;
  average_trip_distance_km: number;
  typical_travel_period: string;
  primary_travel_purpose: string;
}

export type DataMode = "demo" | "real";

export interface DataProvenance {
  mode: DataMode;
  environmentSource: string;
  mobilitySource: string;
  physiologySource: string;
}

export interface DataQuality {
  environmentalLoaded: boolean;
  gpsLoaded: boolean;
  environmentRecordCount: number;
  mobilityRecordCount: number;
  timestampMatchPct: number | null;
  missingPm25Pct: number | null;
  missingGpsPct: number | null;
  unlocatedStationRecordCount: number;
}

export interface RealDataSummary {
  environmentRecordCount: number;
  mobilityRecordCount: number;
  tripCount: number;
  totalDistanceKm: number;
  avgTripDurationMin: number;
  avgSpeedKmh: number;
  stationsRepresented: string[];
  dateRange: { start: string; end: string } | null;
  latestMeasurementTimestamp: string | null;
}
