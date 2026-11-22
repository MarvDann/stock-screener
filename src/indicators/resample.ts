import { DailyBar } from "../types";

export type Timeframe = "daily" | "weekly" | "monthly";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The bucket a bar falls in: its Monday (UTC) for weekly, its month for monthly. */
function periodKey(date: Date, timeframe: Exclude<Timeframe, "daily">): number {
  if (timeframe === "monthly") return date.getUTCFullYear() * 12 + date.getUTCMonth();
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return Math.floor(date.getTime() / MS_PER_DAY) - daysSinceMonday;
}

/**
 * Rolls daily bars (oldest first) up into weekly or monthly bars. Each bar is
 * dated by the first trading day in its period, opens at that day's open,
 * closes at the last day's close, and spans the period's high, low and total
 * volume. The latest bar covers the period so far.
 */
export function resampleBars(bars: DailyBar[], timeframe: Timeframe): DailyBar[] {
  if (timeframe === "daily") return bars;
  const result: DailyBar[] = [];
  let currentKey: number | null = null;
  for (const bar of bars) {
    const key = periodKey(bar.date, timeframe);
    const current = result[result.length - 1];
    if (key !== currentKey || !current) {
      result.push({ ...bar });
      currentKey = key;
      continue;
    }
    current.high = Math.max(current.high, bar.high);
    current.low = Math.min(current.low, bar.low);
    current.close = bar.close;
    current.volume += bar.volume;
  }
  return result;
}
