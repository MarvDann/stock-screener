import { DailyBar } from "../types";
import { highestHigh, lowestLow } from "./movingAverage";

/**
 * Measures how "tight" (contracted) the recent trading range is, as a
 * percentage of price. This is the core "heartbeat"/consolidation signal:
 * a low value means the stock has been trading in a narrow range.
 *
 * Computed as (highest high - lowest low) / lowest low * 100 over `period` bars.
 */
export function rangeContractionPct(
  bars: DailyBar[],
  period: number,
  endIndex = bars.length - 1
): number {
  const high = highestHigh(bars, period, endIndex);
  const low = lowestLow(bars, period, endIndex);
  if (low <= 0) return NaN;
  return ((high - low) / low) * 100;
}

/**
 * Compares the current range contraction to a prior window, to confirm the
 * range is actually *shrinking* (a volatility contraction) rather than just
 * being narrow by coincidence on a single window.
 *
 * Returns true if recent contraction is meaningfully tighter than the prior
 * period (default: at least 20% tighter).
 */
export function isVolatilityContracting(
  bars: DailyBar[],
  shortPeriod: number,
  priorPeriod: number,
  endIndex = bars.length - 1,
  minContractionRatio = 0.8
): boolean {
  const recent = rangeContractionPct(bars, shortPeriod, endIndex);
  const prior = rangeContractionPct(bars, priorPeriod, endIndex - shortPeriod);
  if (isNaN(recent) || isNaN(prior) || prior === 0) return false;
  return recent / prior <= minContractionRatio;
}

/**
 * Average daily volume over `period` bars.
 */
export function averageVolume(bars: DailyBar[], period: number, endIndex = bars.length - 1): number {
  const start = Math.max(0, endIndex - period + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= endIndex; i++) {
    sum += bars[i].volume;
    count++;
  }
  return count > 0 ? sum / count : NaN;
}

/**
 * Today's volume as a multiple of the average volume over the prior period
 * (average excludes today's bar so a volume spike doesn't inflate its own baseline).
 */
export function volumeRatio(bars: DailyBar[], period: number, endIndex = bars.length - 1): number {
  const avg = averageVolume(bars, period, endIndex - 1);
  const today = bars[endIndex].volume;
  if (!avg) return NaN;
  return today / avg;
}
