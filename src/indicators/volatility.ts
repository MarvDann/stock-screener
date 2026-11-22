import { DailyBar } from "../types";

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
