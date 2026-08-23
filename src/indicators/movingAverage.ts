import { DailyBar } from "../types";

/**
 * Simple moving average of closing price over the last `period` bars.
 * Returns NaN if there isn't enough history.
 */
export function sma(bars: DailyBar[], period: number, endIndex = bars.length - 1): number {
  if (endIndex - period + 1 < 0) return NaN;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    sum += bars[i].close;
  }
  return sum / period;
}

/**
 * Whether the SMA has been trending up over the last `windowDays`.
 * Compares the current SMA to the SMA value `windowDays` ago.
 */
export function isSmaSlopePositive(
  bars: DailyBar[],
  period: number,
  windowDays: number,
  endIndex = bars.length - 1
): boolean {
  const current = sma(bars, period, endIndex);
  const past = sma(bars, period, endIndex - windowDays);
  if (isNaN(current) || isNaN(past)) return false;
  return current > past;
}

/**
 * Highest high over the last `period` bars (inclusive of endIndex).
 */
export function highestHigh(bars: DailyBar[], period: number, endIndex = bars.length - 1): number {
  const start = Math.max(0, endIndex - period + 1);
  let max = -Infinity;
  for (let i = start; i <= endIndex; i++) {
    max = Math.max(max, bars[i].high);
  }
  return max;
}

/**
 * Lowest low over the last `period` bars (inclusive of endIndex).
 */
export function lowestLow(bars: DailyBar[], period: number, endIndex = bars.length - 1): number {
  const start = Math.max(0, endIndex - period + 1);
  let min = Infinity;
  for (let i = start; i <= endIndex; i++) {
    min = Math.min(min, bars[i].low);
  }
  return min;
}

/**
 * % distance of the current close below its N-day high (52-week high, etc).
 * 0 = at the high, positive = below it.
 */
export function pctOffHigh(bars: DailyBar[], period: number, endIndex = bars.length - 1): number {
  const high = highestHigh(bars, period, endIndex);
  const close = bars[endIndex].close;
  if (high <= 0) return NaN;
  return ((high - close) / high) * 100;
}
