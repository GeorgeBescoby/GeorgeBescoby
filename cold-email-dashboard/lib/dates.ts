// Calendar-day helpers. A "day" is a YYYY-MM-DD string in Europe/London time;
// arithmetic is done on UTC dates so DST never shifts a day.
import { TIMEZONE } from "@/config/defaults";

export type Day = string; // YYYY-MM-DD

export type PeriodKey = "this_week" | "this_month" | "last_month" | "all_time";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "this_week", label: "This week" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "all_time", label: "All time" },
];

export type Period = { key: PeriodKey; label: string; start: Day; end: Day };

function toDate(d: Day): Date {
  return new Date(`${d}T00:00:00Z`);
}

function fromDate(d: Date): Day {
  return d.toISOString().slice(0, 10);
}

/** Calendar day in London for an instant (defaults to now). */
export function londonDay(instant: Date = new Date()): Day {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    instant,
  );
}

export function today(): Day {
  const pinned = typeof process !== "undefined" ? process.env?.DASHBOARD_TODAY : undefined;
  return pinned || londonDay();
}

export function addDays(d: Day, n: number): Day {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromDate(x);
}

export function daysBetweenInclusive(start: Day, end: Day): number {
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86_400_000) + 1;
}

export function daysInMonth(d: Day): number {
  const x = toDate(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
}

export function startOfMonth(d: Day): Day {
  return d.slice(0, 8) + "01";
}

export function endOfMonth(d: Day): Day {
  return d.slice(0, 8) + String(daysInMonth(d)).padStart(2, "0");
}

/** Monday of the ISO week containing d. */
export function startOfWeek(d: Day): Day {
  const dow = (toDate(d).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(d, -dow);
}

export function minDay(a: Day, b: Day): Day {
  return a < b ? a : b;
}

export function maxDay(a: Day, b: Day): Day {
  return a > b ? a : b;
}

/**
 * Resolve a period to an inclusive date range. "This week"/"This month" run to
 * today. `allTimeStart` is the earliest date with data or costs.
 */
export function resolvePeriod(key: PeriodKey, todayDay: Day, allTimeStart: Day): Period {
  const label = PERIODS.find((p) => p.key === key)!.label;
  switch (key) {
    case "this_week":
      return { key, label, start: startOfWeek(todayDay), end: todayDay };
    case "this_month":
      return { key, label, start: startOfMonth(todayDay), end: todayDay };
    case "last_month": {
      const lastDayPrev = addDays(startOfMonth(todayDay), -1);
      return { key, label, start: startOfMonth(lastDayPrev), end: lastDayPrev };
    }
    case "all_time":
      return { key, label, start: minDay(allTimeStart, todayDay), end: todayDay };
  }
}

export function parsePeriodKey(v: unknown): PeriodKey {
  return PERIODS.some((p) => p.key === v) ? (v as PeriodKey) : "this_month";
}

/** Mondays of every week overlapping [start, end]. */
export function weeksInRange(start: Day, end: Day): Day[] {
  const out: Day[] = [];
  for (let w = startOfWeek(start); w <= end; w = addDays(w, 7)) out.push(w);
  return out;
}

export function formatDayShort(d: Day): string {
  return toDate(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
