import { DailyBar } from "../types";

/**
 * Simple % return over the last `tradingDays` bars.
 */
export function periodReturnPct(
  bars: DailyBar[],
  tradingDays: number,
  endIndex = bars.length - 1
): number {
  const startIndex = endIndex - tradingDays;
  if (startIndex < 0) return NaN;
  const startPrice = bars[startIndex].close;
  const endPrice = bars[endIndex].close;
  if (!startPrice) return NaN;
  return ((endPrice - startPrice) / startPrice) * 100;
}

/**
 * Relative strength = a symbol's return minus the benchmark's return over
 * the same period. Positive means it's outperforming the benchmark
 * (money rotating in); negative means underperforming (money rotating out).
 */
export function relativeStrength(
  symbolBars: DailyBar[],
  benchmarkBars: DailyBar[],
  tradingDays: number
): number {
  const symbolReturn = periodReturnPct(symbolBars, tradingDays);
  const benchmarkReturn = periodReturnPct(benchmarkBars, tradingDays);
  if (isNaN(symbolReturn) || isNaN(benchmarkReturn)) return NaN;
  return symbolReturn - benchmarkReturn;
}

/**
 * Chaikin Money Flow style accumulation/distribution proxy, simplified:
 * for each bar, compute the "money flow multiplier" (where the close sat
 * within the day's range, from -1 at the low to +1 at the high) weighted
 * by volume, then average over the period. Positive = accumulation
 * (buying pressure), negative = distribution (selling pressure).
 */
export function moneyFlowScore(
  bars: DailyBar[],
  period: number,
  endIndex = bars.length - 1
): number {
  const start = Math.max(0, endIndex - period + 1);
  let volumeWeightedSum = 0;
  let totalVolume = 0;

  for (let i = start; i <= endIndex; i++) {
    const bar = bars[i];
    const range = bar.high - bar.low;
    if (range === 0) continue;
    const multiplier = ((bar.close - bar.low) - (bar.high - bar.close)) / range;
    volumeWeightedSum += multiplier * bar.volume;
    totalVolume += bar.volume;
  }

  if (totalVolume === 0) return NaN;
  return volumeWeightedSum / totalVolume;
}

export function classifyMoneyFlow(score: number): "accumulation" | "distribution" | "neutral" {
  if (isNaN(score)) return "neutral";
  if (score > 0.05) return "accumulation";
  if (score < -0.05) return "distribution";
  return "neutral";
}
