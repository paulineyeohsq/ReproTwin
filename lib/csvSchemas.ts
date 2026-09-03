export interface CsvSchema {
  key: string;
  label: string;
  columns: string[];
  timestampColumn: string;
}

export const CSV_SCHEMAS: CsvSchema[] = [
  {
    key: "gps",
    label: "GPS",
    columns: ["timestamp", "latitude", "longitude", "speed"],
    timestampColumn: "timestamp",
  },
  {
    key: "health",
    label: "Health",
    columns: [
      "timestamp",
      "heart_rate",
      "resting_heart_rate",
      "hrv",
      "spo2",
      "respiratory_rate",
      "steps",
      "sleep_duration",
    ],
    timestampColumn: "timestamp",
  },
  {
    key: "environment",
    label: "Environment",
    columns: [
      "timestamp",
      "latitude",
      "longitude",
      "pm25",
      "pm10",
      "no2",
      "temperature",
      "humidity",
      "traffic_level",
    ],
    timestampColumn: "timestamp",
  },
];
