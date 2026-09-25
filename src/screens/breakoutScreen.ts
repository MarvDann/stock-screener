import { BreakoutScreenResult, SymbolHistory } from "../types";
import { sma } from "../indicators/movingAverage";
import { isVolatilityContracting, rangeContractionPct, volumeRatio } from "../indicators/volatility";

/** SMA period the breakout trigger and "approaching" state are measured against. */
const TRIGGER_SMA_PERIOD = 50;

export interface BreakoutScreenConfig {
  /** Bars in the "tight" consolidation window used by the heartbeat check. Default 15 trading days. */
  consolidationPeriod: number;
  /** Prior window compared against to confirm contraction. Default 40 trading days. */
  priorPeriod: number;
  /** Max distance below the 50-day SMA, as a percent, to count as "approaching". Default 5. */
  approachingThresholdPct: number;
  /** Minimum volume multiple vs average for a cross to count as a confirmed trigger. Default 2x. */
  minTriggerVolumeRatio: number;
  /** Lookback for the average-volume baseline used by the trigger's volume check. Default 20 trading days. */
  volumeAvgPeriod: number;
  /** How many trailing trading days (including today) to look back for the MA50 cross. Default 3. */
  crossLookbackDays: number;
  /** Trading days over which the 50-day SMA's slope is measured for "approaching". Default 10. */
  slopeLookbackDays: number;
  /**
   * Minimum % change in the 50-day SMA over `slopeLookbackDays` to count as "approaching".
   * Slightly negative so a leveled-out SMA still qualifies. Default -0.5.
   */
  minSma50SlopePct: number;
}

export const DEFAULT_BREAKOUT_CONFIG: BreakoutScreenConfig = {
  consolidationPeriod: 15,
  priorPeriod: 40,
  approachingThresholdPct: 5,
  minTriggerVolumeRatio: 2,
  volumeAvgPeriod: 20,
  crossLookbackDays: 3,
  slopeLookbackDays: 10,
  minSma50SlopePct: -0.5,
};

/**
 * Finds the most recent trading day, within the last `lookbackDays` days
 * (inclusive of `endIndex`), on which the close crossed from at-or-below
 * the 50-day SMA to above it. Returns null if price isn't above the SMA
 * today, or no such crossing occurred in the window.
 */
function findCrossDayIndex(
  bars: SymbolHistory["bars"],
  endIndex: number,
  lookbackDays: number
): number | null {
  const todaySma = sma(bars, TRIGGER_SMA_PERIOD, endIndex);
  if (isNaN(todaySma) || bars[endIndex].close <= todaySma) return null;

  for (let d = endIndex; d > endIndex - lookbackDays && d - 1 >= 0; d--) {
    const smaAtD = sma(bars, TRIGGER_SMA_PERIOD, d);
    const smaAtPrev = sma(bars, TRIGGER_SMA_PERIOD, d - 1);
    if (isNaN(smaAtD) || isNaN(smaAtPrev)) continue;
    if (bars[d].close > smaAtD && bars[d - 1].close <= smaAtPrev) {
      return d;
    }
  }
  return null;
}

/**
 * Runs the breakout screen against one symbol's history using the
 * 50-day SMA cross definition. Requires at least 50 bars to compute the
 * SMA at all; returns null below that (naturally means "no state" once
 * enough bars exist and none of the conditions hold, too).
 */
export function runBreakoutScreen(
  history: SymbolHistory,
  config: BreakoutScreenConfig = DEFAULT_BREAKOUT_CONFIG,
  name = ""
): BreakoutScreenResult | null {
  const { bars, symbol } = history;
  const endIndex = bars.length - 1;
  const sma50 = sma(bars, TRIGGER_SMA_PERIOD, endIndex);
  if (isNaN(sma50)) return null;

  const close = bars[endIndex].close;
  const pctBelowSma50 = ((sma50 - close) / sma50) * 100;

  const crossDayIndex = findCrossDayIndex(bars, endIndex, config.crossLookbackDays);
  if (crossDayIndex !== null) {
    const heartbeatAnchor = crossDayIndex - 1;
    const isConsolidating = isVolatilityContracting(
      bars,
      config.consolidationPeriod,
      config.priorPeriod,
      heartbeatAnchor
    );
    const volRatio = volumeRatio(bars, config.volumeAvgPeriod, endIndex);

    if (isConsolidating && volRatio >= config.minTriggerVolumeRatio) {
      return {
        symbol,
        name,
        state: "triggered",
        details: {
          close,
          sma50,
          pctBelowSma50,
          rangeContractionPct: rangeContractionPct(bars, config.consolidationPeriod, heartbeatAnchor),
          volumeRatio: volRatio,
          daysSinceCross: endIndex - crossDayIndex,
        },
      };
    }
  }

  // Leveled out or turning up — excludes stocks sliding under a falling 50-day SMA.
  const priorSma50 = sma(bars, TRIGGER_SMA_PERIOD, endIndex - config.slopeLookbackDays);
  const sma50SlopePct = ((sma50 - priorSma50) / priorSma50) * 100;

  const isApproaching =
    close < sma50 &&
    pctBelowSma50 <= config.approachingThresholdPct &&
    sma50SlopePct >= config.minSma50SlopePct &&
    isVolatilityContracting(bars, config.consolidationPeriod, config.priorPeriod, endIndex);

  if (isApproaching) {
    return {
      symbol,
      name,
      state: "approaching",
      details: {
        close,
        sma50,
        pctBelowSma50,
        rangeContractionPct: rangeContractionPct(bars, config.consolidationPeriod, endIndex),
        volumeRatio: volumeRatio(bars, config.volumeAvgPeriod, endIndex),
        daysSinceCross: null,
      },
    };
  }

  return null;
}

/**
 * Runs the breakout screen across many symbols and splits the qualifying
 * results into triggered vs. approaching buckets.
 */
export function scanBreakoutScreen(
  histories: SymbolHistory[],
  config: BreakoutScreenConfig = DEFAULT_BREAKOUT_CONFIG,
  names: Record<string, string> = {}
): { triggered: BreakoutScreenResult[]; approaching: BreakoutScreenResult[] } {
  const results = histories
    .map((h) => runBreakoutScreen(h, config, names[h.symbol] ?? ""))
    .filter((r): r is BreakoutScreenResult => r !== null);

  const triggered = results
    .filter((r) => r.state === "triggered")
    .sort((a, b) => b.details.volumeRatio - a.details.volumeRatio);

  const approaching = results
    .filter((r) => r.state === "approaching")
    .sort((a, b) => a.details.pctBelowSma50 - b.details.pctBelowSma50);

  return {
    triggered,
    approaching,
  };
}
