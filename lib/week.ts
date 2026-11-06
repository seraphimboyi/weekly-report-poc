import { WEEK_CONFIG } from "./config";

const pad = (n: number) => String(n).padStart(2, "0");

/** Date -> YYYY-MM-DD (local time). */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD -> local Date at 00:00. */
export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** YYYY-MM-DD -> YYYY/MM/DD (display format used in the report). */
export function toSlashDate(iso: string): string {
  return iso.replaceAll("-", "/");
}

/** True for days that are read-only and excluded from the report. */
export function isWeekend(date: Date): boolean {
  return (WEEK_CONFIG.weekendDays as readonly number[]).includes(date.getDay());
}

/** Report-week range (per WEEK_CONFIG) containing the given date. */
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const offset = (date.getDay() - WEEK_CONFIG.startDay + 7) % 7;
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - offset,
  );
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + WEEK_CONFIG.length - 1,
  );
  return { start, end };
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
