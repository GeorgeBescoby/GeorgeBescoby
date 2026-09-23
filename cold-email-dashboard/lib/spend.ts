// Spend is static config, pro-rated by calendar day:
//   spend(period) = Σ over months:  monthly total × (days of period in month ÷ days in month)
// Costs accrue from costStartDate and never beyond today.
import type { Settings } from "@/config/defaults";
import { addDays, daysBetweenInclusive, daysInMonth, endOfMonth, maxDay, minDay, type Day } from "./dates";

export function monthlyUsd(settings: Settings): number {
  return settings.costs.reduce((s, c) => s + c.usdPerMonth, 0);
}

export function monthlyGbp(settings: Settings): number {
  return monthlyUsd(settings) * settings.usdToGbp;
}

export function spendGbp(settings: Settings, start: Day, end: Day, todayDay: Day): number {
  const from = maxDay(start, settings.costStartDate);
  const to = minDay(end, todayDay);
  if (from > to) return 0;

  const perMonth = monthlyGbp(settings);
  let total = 0;
  for (let cursor = from; cursor <= to; ) {
    const segEnd = minDay(endOfMonth(cursor), to);
    total += perMonth * (daysBetweenInclusive(cursor, segEnd) / daysInMonth(cursor));
    cursor = addDays(segEnd, 1);
  }
  return total;
}
