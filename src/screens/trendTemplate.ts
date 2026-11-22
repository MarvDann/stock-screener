import { DailyBar } from "../types";
import { highestHigh, lowestLow, sma } from "../indicators/movingAverage";

/** Bars in a trading year, for the 52-week high/low checks. */
const YEAR_BARS = 252;

export interface TrendTemplateConfig {
  /** Bars the 200-day SMA must have been rising over. Minervini: at least 1 month. Default 22. */
  sma200RisingBars: number;
  /** Min % the close must be above its 52-week low. Default 30. */
  minAbove52WeekLowPct: number;
  /** Max % the close may be below its 52-week high. Default 25. */
  maxBelow52WeekHighPct: number;
  /** Min RS Rating (1–99). Default 70. Skipped when no rating is available. */
  minRsRating: number;
}

export const DEFAULT_TREND_TEMPLATE_CONFIG: TrendTemplateConfig = {
  sma200RisingBars: 22,
  minAbove52WeekLowPct: 30,
  maxBelow52WeekHighPct: 25,
  minRsRating: 70,
};

/**
 * Minervini's Trend Template — the eight conditions for a stock in a Stage 2
 * uptrend — evaluated at `endIndex`. `rsRating` is null when the universe
 * hasn't been ranked, in which case the RS criterion is skipped.
 */
export function passesTrendTemplate(
  bars: DailyBar[],
  endIndex: number,
  rsRating: number | null,
  config: TrendTemplateConfig = DEFAULT_TREND_TEMPLATE_CONFIG
): boolean {
  const close = bars[endIndex].close;
  const sma50 = sma(bars, 50, endIndex);
  const sma150 = sma(bars, 150, endIndex);
  const sma200 = sma(bars, 200, endIndex);
  const sma200Before = sma(bars, 200, endIndex - config.sma200RisingBars);
  if ([sma50, sma150, sma200, sma200Before].some(isNaN)) return false;

  const yearLow = lowestLow(bars, YEAR_BARS, endIndex);
  const yearHigh = highestHigh(bars, YEAR_BARS, endIndex);

  return (
    // 1. Price above the 150- and 200-day SMAs.
    close > sma150 &&
    close > sma200 &&
    // 2. 150-day above the 200-day.
    sma150 > sma200 &&
    // 3. 200-day trending up for at least a month.
    sma200 > sma200Before &&
    // 4. 50-day above both the 150- and 200-day.
    sma50 > sma150 &&
    sma50 > sma200 &&
    // 5. Price above the 50-day.
    close > sma50 &&
    // 6. At least 30% above the 52-week low.
    close >= yearLow * (1 + config.minAbove52WeekLowPct / 100) &&
    // 7. Within 25% of the 52-week high.
    close >= yearHigh * (1 - config.maxBelow52WeekHighPct / 100) &&
    // 8. RS Rating of at least 70.
    (rsRating === null || rsRating >= config.minRsRating)
  );
}
