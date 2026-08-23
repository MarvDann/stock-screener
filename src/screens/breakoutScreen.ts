import { BreakoutScreenResult, SymbolHistory } from "../types";
import { sma } from "../indicators/movingAverage";
import { isVolatilityContracting, rangeContractionPct, volumeRatio } from "../indicators/volatility";

export interface BreakoutScreenConfig {
  /** Bars in the "tight" consolidation window used by the heartbeat check. Default 15 trading days. */
  consolidationPeriod: number;
  /** Prior window compared against to confirm contraction. Default 40 trading days. */
  priorPeriod: number;
  /** Max distance below the 150-day SMA, as a percent, to count as "approaching". Default 5. */
  approachingThresholdPct: number;
  /** Minimum volume multiple vs average for a cross to count as a confirmed trigger. Default 1.4x. */
  minTriggerVolumeRatio: number;
  /** Lookback for the average-volume baseline used by the trigger's volume check. Default 20 trading days. */
  volumeAvgPeriod: number;
  /** How many trailing trading days (including today) to look back for the MA150 cross. Default 3. */
  crossLookbackDays: number;
}

export const DEFAULT_BREAKOUT_CONFIG: BreakoutScreenConfig = {
  consolidationPeriod: 15,
  priorPeriod: 40,
  approachingThresholdPct: 5,
  minTriggerVolumeRatio: 1.4,
  volumeAvgPeriod: 20,
  crossLookbackDays: 3,
};

/**
 * Finds the most recent trading day, within the last `lookbackDays` days
 * (inclusive of `endIndex`), on which the close crossed from at-or-below
 * the 150-day SMA to above it. Returns null if price isn't above the SMA
 * today, or no such crossing occurred in the window.
 */
function findCrossDayIndex(
  bars: SymbolHistory["bars"],
  endIndex: number,
  lookbackDays: number
): number | null {
  const todaySma = sma(bars, 150, endIndex);
  if (isNaN(todaySma) || bars[endIndex].close <= todaySma) return null;

  for (let d = endIndex; d > endIndex - lookbackDays && d - 1 >= 0; d--) {
    const smaAtD = sma(bars, 150, d);
    const smaAtPrev = sma(bars, 150, d - 1);
    if (isNaN(smaAtD) || isNaN(smaAtPrev)) continue;
    if (bars[d].close > smaAtD && bars[d - 1].close <= smaAtPrev) {
      return d;
    }
  }
  return null;
}

/**
 * Runs the breakout screen against one symbol's history using the
 * 150-day SMA cross definition. Requires at least 150 bars to compute the
 * SMA at all; returns null below that (naturally means "no state" once
 * enough bars exist and none of the conditions hold, too).
 */
export function runBreakoutScreen(
  history: SymbolHistory,
  config: BreakoutScreenConfig = DEFAULT_BREAKOUT_CONFIG
): BreakoutScreenResult | null {
  const { bars, symbol } = history;
  const endIndex = bars.length - 1;
  const sma150 = sma(bars, 150, endIndex);
  if (isNaN(sma150)) return null;

  const close = bars[endIndex].close;
  const pctBelowSma150 = ((sma150 - close) / sma150) * 100;

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
        state: "triggered",
        details: {
          close,
          sma150,
          pctBelowSma150,
          rangeContractionPct: rangeContractionPct(bars, config.consolidationPeriod, heartbeatAnchor),
          volumeRatio: volRatio,
          daysSinceCross: endIndex - crossDayIndex,
        },
      };
    }
  }

  const isApproaching =
    close < sma150 &&
    pctBelowSma150 <= config.approachingThresholdPct &&
    isVolatilityContracting(bars, config.consolidationPeriod, config.priorPeriod, endIndex);

  if (isApproaching) {
    return {
      symbol,
      state: "approaching",
      details: {
        close,
        sma150,
        pctBelowSma150,
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
  config: BreakoutScreenConfig = DEFAULT_BREAKOUT_CONFIG
): { triggered: BreakoutScreenResult[]; approaching: BreakoutScreenResult[] } {
  const results = histories
    .map((h) => runBreakoutScreen(h, config))
    .filter((r): r is BreakoutScreenResult => r !== null);

  return {
    triggered: results.filter((r) => r.state === "triggered"),
    approaching: results.filter((r) => r.state === "approaching"),
  };
}
