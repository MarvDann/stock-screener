import { DailyBar } from "../types";

export function mansfieldRelativeStrength(
  symbolBars: DailyBar[],
  benchmarkBars: DailyBar[],
  period = 200,
  endIndex = Math.min(symbolBars.length, benchmarkBars.length) - 1
): number {
  if (endIndex < period - 1) return NaN;

  const ratios: number[] = [];
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    if (!benchmarkBars[i].close) return NaN;
    ratios.push(symbolBars[i].close / benchmarkBars[i].close);
  }

  const sma = ratios.reduce((sum, v) => sum + v, 0) / ratios.length;
  if (!sma) return NaN;
  return ((ratios[ratios.length - 1] / sma) - 1) * 100;
}

export function classifyCapitalFlow(
  mansfieldRs: number,
  moneyFlowTrend: "accumulation" | "distribution" | "neutral"
): "accumulating" | "distributing" | "neutral" {
  if (!isNaN(mansfieldRs) && mansfieldRs > 0 && moneyFlowTrend === "accumulation") return "accumulating";
  if (!isNaN(mansfieldRs) && mansfieldRs < 0 && moneyFlowTrend === "distribution") return "distributing";
  return "neutral";
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
