import { BreakoutScreenResult, SymbolHistory } from "../types";
import { sma, isSmaSlopePositive, pctOffHigh, highestHigh } from "../indicators/movingAverage";
import { rangeContractionPct, isVolatilityContracting, volumeRatio } from "../indicators/volatility";

export interface BreakoutScreenConfig {
  /** Bars to look at for the "tight" consolidation window. Default 15 trading days. */
  consolidationPeriod: number;
  /** Prior window to compare against to confirm contraction. Default 40 trading days. */
  priorPeriod: number;
  /** Max allowed distance below 52-week high to still be considered "near the top". Default 25%. */
  maxPctOffHigh: number;
  /** Minimum volume multiple vs average to count as a real breakout. Default 1.4x. */
  minBreakoutVolumeRatio: number;
  /** Lookback for average volume baseline. Default 50 trading days. */
  volumeAvgPeriod: number;
}

export const DEFAULT_BREAKOUT_CONFIG: BreakoutScreenConfig = {
  consolidationPeriod: 15,
  priorPeriod: 40,
  maxPctOffHigh: 25,
  minBreakoutVolumeRatio: 1.4,
  volumeAvgPeriod: 50,
};

/**
 * Runs the Stage-2 trend template + volatility-contraction + breakout screen
 * against one symbol's history. Requires at least ~220 trading days of bars
 * for the 200-day SMA and slope check to be meaningful.
 */
export function runBreakoutScreen(
  history: SymbolHistory,
  config: BreakoutScreenConfig = DEFAULT_BREAKOUT_CONFIG
): BreakoutScreenResult | null {
  const { bars, symbol } = history;
  const endIndex = bars.length - 1;

  if (endIndex < 220) {
    // Not enough history for a reliable 200-day SMA + slope check.
    return null;
  }

  const close = bars[endIndex].close;
  const sma50 = sma(bars, 50, endIndex);
  const sma150 = sma(bars, 150, endIndex);
  const sma200 = sma(bars, 200, endIndex);
  const sma200SlopePositive = isSmaSlopePositive(bars, 200, 20, endIndex);
  const pctOff52wHigh = pctOffHigh(bars, 252, endIndex);

  // Stage 2 trend template (Minervini-style).
  const passesTrendTemplate =
    close > sma150 &&
    close > sma200 &&
    sma150 > sma200 &&
    sma200SlopePositive &&
    close > sma50 &&
    pctOff52wHigh <= config.maxPctOffHigh;

  // Volatility contraction ("heartbeat") over the recent window vs prior window.
  const isConsolidating = isVolatilityContracting(
    bars,
    config.consolidationPeriod,
    config.priorPeriod,
    endIndex
  );

  // Breakout trigger: close above the high of the consolidation range, on volume.
  // Pivot is the high of the consolidation window *excluding* today's bar.
  const pivotHigh = highestHigh(bars, config.consolidationPeriod, endIndex - 1);
  const volRatio = volumeRatio(bars, config.volumeAvgPeriod, endIndex);
  const isBreakingOut =
    close > pivotHigh && volRatio >= config.minBreakoutVolumeRatio;

  return {
    symbol,
    passesTrendTemplate,
    isConsolidating,
    isBreakingOut: passesTrendTemplate && isConsolidating && isBreakingOut,
    details: {
      close,
      sma50,
      sma150,
      sma200,
      sma200SlopePositive,
      pctOff52wHigh,
      rangeContractionPct: rangeContractionPct(bars, config.consolidationPeriod, endIndex),
      volumeRatio: volRatio,
      pivotHigh,
    },
  };
}

/**
 * Runs the breakout screen across many symbols and returns only the ones
 * flagged as a full breakout (trend template + consolidation + trigger all pass).
 */
export function scanForBreakouts(
  histories: SymbolHistory[],
  config: BreakoutScreenConfig = DEFAULT_BREAKOUT_CONFIG
): BreakoutScreenResult[] {
  return histories
    .map((h) => runBreakoutScreen(h, config))
    .filter((r): r is BreakoutScreenResult => r !== null && r.isBreakingOut);
}

export interface NearBreakoutCandidate extends BreakoutScreenResult {
  /**
   * % distance from the current close up to the pivot. 0 or negative means
   * the close is already at/above the pivot (i.e. it has triggered, or
   * missed the volume confirmation needed to count as a full breakout).
   */
  proximityToPivotPct: number;
}

/**
 * Finds symbols that pass the trend template and are consolidating, but
 * haven't (yet) triggered a confirmed breakout — i.e. candidates worth
 * watching. Ranked by how close price is to the pivot (closest first).
 */
export function scanForNearBreakouts(
  histories: SymbolHistory[],
  config: BreakoutScreenConfig = DEFAULT_BREAKOUT_CONFIG,
  maxCandidates = 10
): NearBreakoutCandidate[] {
  const candidates: NearBreakoutCandidate[] = histories
    .map((h) => runBreakoutScreen(h, config))
    .filter((r): r is BreakoutScreenResult => r !== null && r.passesTrendTemplate && r.isConsolidating)
    .map((r) => ({
      ...r,
      proximityToPivotPct: ((r.details.pivotHigh - r.details.close) / r.details.pivotHigh) * 100,
    }));

  return candidates
    .sort((a, b) => a.proximityToPivotPct - b.proximityToPivotPct)
    .slice(0, maxCandidates);
}
