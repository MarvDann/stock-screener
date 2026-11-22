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

/** Trading-day offsets and weights for IBD's RS Rating: the latest quarter counts double. */
const RS_RATING_WEIGHTS: [bars: number, weight: number][] = [
  [63, 0.4],
  [126, 0.2],
  [189, 0.2],
  [252, 0.2],
];

/** Weighted 12-month price performance used to rank RS Ratings, or NaN without a year of history. */
export function rsRatingScore(bars: DailyBar[], endIndex = bars.length - 1): number {
  const close = bars[endIndex]?.close;
  let score = 0;
  for (const [offset, weight] of RS_RATING_WEIGHTS) {
    const past = bars[endIndex - offset]?.close;
    if (!past || !close) return NaN;
    score += weight * (close / past);
  }
  return score;
}

/**
 * IBD/MarketSurge-style RS Rating: each symbol's weighted 12-month
 * performance as a percentile (1–99) of the others'. Symbols without a
 * year of history get no rating.
 */
export function rsRatings(histories: { symbol: string; bars: DailyBar[] }[]): Map<string, number> {
  const scored = histories
    .map((h) => ({ symbol: h.symbol, score: rsRatingScore(h.bars) }))
    .filter((s) => !isNaN(s.score))
    .sort((a, b) => a.score - b.score);
  const ratings = new Map<string, number>();
  if (scored.length < 2) return ratings;
  scored.forEach((s, rank) => ratings.set(s.symbol, Math.round(1 + (98 * rank) / (scored.length - 1))));
  return ratings;
}

/**
 * The RS line — close divided by the benchmark's close on the same date —
 * for each of `symbolBars`. NaN where the benchmark has no bar that day.
 */
export function rsLine(symbolBars: DailyBar[], benchmarkBars: DailyBar[]): number[] {
  const benchmarkByDate = new Map(benchmarkBars.map((b) => [new Date(b.date).toDateString(), b.close]));
  return symbolBars.map((bar) => {
    const benchmarkClose = benchmarkByDate.get(new Date(bar.date).toDateString());
    return benchmarkClose ? bar.close / benchmarkClose : NaN;
  });
}

/** True when the RS line closes at its highest level of the trailing `period` bars — MarketSurge's "blue dot". */
export function isRsLineAtNewHigh(line: number[], period = 252, endIndex = line.length - 1): boolean {
  const today = line[endIndex];
  if (isNaN(today)) return false;
  for (let i = Math.max(0, endIndex - period + 1); i < endIndex; i++) {
    if (line[i] > today) return false;
  }
  return true;
}
