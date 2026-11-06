export const DEFAULT_USER_ID = "local";

// A report week starts on `startDay` and lasts `length` consecutive days
// (Wed to next Tue). Days in `weekendDays` are shown read-only and are not
// carried into the report. Change here only (0 = Sunday ... 6 = Saturday).
export const WEEK_CONFIG = {
  startDay: 3,
  length: 7,
  weekendDays: [0, 6],
} as const;
