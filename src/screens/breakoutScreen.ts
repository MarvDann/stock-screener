import { BasePattern, BreakoutScreenResult, DailyBar, SymbolHistory } from "../types";
import { lowestLow, sma } from "../indicators/movingAverage";
import { averageVolume, volumeRatio } from "../indicators/volatility";
import { Contraction, findContractions } from "../indicators/swings";
import { isRsLineAtNewHigh, rsLine, rsRatings } from "../indicators/relativeStrength";
import { DEFAULT_TREND_TEMPLATE_CONFIG, TrendTemplateConfig, passesTrendTemplate } from "./trendTemplate";

/** SMA period the heartbeat chops across. */
const HEARTBEAT_SMA_PERIOD = 50;

/** How close, in %, a high must come to the resistance level to count as a test of it. */
const RESISTANCE_TOUCH_PCT = 1;

/** Bars either side of a base's left-side peak searched for the resistance it spiked above. */
const LEFT_SIDE_WINDOW = 10;

export interface BreakoutScreenConfig {
  /** Longest base considered, in bars. Minervini: up to 65 weeks. Default 325. */
  maxBaseBars: number;
  /** Shortest flat base (and heartbeat), in bars. Minervini: at least 5 weeks. Default 25. */
  minFlatBaseBars: number;
  /** Deepest a flat base (and heartbeat) may correct, in %. Default 15. */
  maxFlatBaseDepthPct: number;
  /** Shortest cup, in bars. Minervini: at least 7 weeks. Default 35. */
  minCupBars: number;
  /** Deepest a cup may correct, in %. Minervini: ideally no more than 35. Default 35. */
  maxCupDepthPct: number;
  /** Deepest the cup of a cup with handle may correct, left-side high to the cup's low, in %. Default 25. */
  maxCupHandleDepthPct: number;
  /** Deepest a handle may pull back, in %. Default 12. */
  maxHandleDepthPct: number;
  /** A cup's pause is a handle when its high is within this % of the left-side high; lower, it's a low cheat. Default 5. */
  maxHandleBelowHighPct: number;
  /** Min advance into the base's left-side high, in %. Minervini: at least 25–30. Default 25. */
  minPriorAdvancePct: number;
  /** Bars before the base searched for the low the prior advance is measured from. Default 126 (6 months). */
  priorAdvanceLookback: number;
  /** Reversal, in %, that confirms a swing high or low when counting contractions. Default 3. */
  swingThresholdPct: number;
  /** Most contractions a VCP may have. Minervini: 2 to 6. Default 6. */
  maxContractions: number;
  /** The final contraction must be shallower than this %, i.e. single digits — volatility must be tight at the pivot. Default 10. */
  maxFinalContractionPct: number;
  /** Days that may spike above a resistance level (the pivot or the left-side high) without setting it. Default 3. */
  maxPivotSpikeBars: number;
  /** % a spike's peak must clear the resistance level by to be ignored rather than be the level itself. Default 2. */
  pivotSpikePct: number;
  /** Times price must test the resistance level, besides the spike, for the spike to be ignored. Default 3. */
  minPivotTouches: number;
  /** Fewest bars the final contraction must span, so a stock still running up isn't "tight". Default 5. */
  minFinalContractionBars: number;
  /** Max ratio of the final contraction's average volume to the 50 days before it — volume must dry up. Default 1. */
  maxFinalVolumeRatio: number;
  /** Min times the close crosses the 50-day SMA during a flat base for it to be a heartbeat. Default 3. */
  minSmaCrosses: number;
  /** Max % the 50-day SMA may drift across a heartbeat, so the chop is horizontal. Default 4. */
  maxSma50DriftPct: number;
  /** Max distance below the pivot, in %, to count as "approaching". Default 5. */
  approachingThresholdPct: number;
  /** Breakout-day volume vs average for a volume-confirmed breakout. Minervini: 40–50% above average. Default 1.4. */
  minBreakoutVolumeRatio: number;
  /** Bars in the average-volume baseline. Default 50. */
  volumeAvgPeriod: number;
  /** Max % above the pivot before a breakout is extended past the buy range. Minervini: 5. Default 5. */
  maxBuyRangePct: number;
  /** Trailing trading days (including today) searched for the pivot cross. Default 3. */
  breakoutLookbackDays: number;
  trendTemplate: TrendTemplateConfig;
}

export const DEFAULT_BREAKOUT_CONFIG: BreakoutScreenConfig = {
  maxBaseBars: 325,
  minFlatBaseBars: 25,
  maxFlatBaseDepthPct: 15,
  minCupBars: 35,
  maxCupDepthPct: 35,
  maxCupHandleDepthPct: 25,
  maxHandleDepthPct: 12,
  maxHandleBelowHighPct: 5,
  minPriorAdvancePct: 25,
  priorAdvanceLookback: 126,
  swingThresholdPct: 3,
  maxContractions: 6,
  maxFinalContractionPct: 10,
  maxPivotSpikeBars: 3,
  pivotSpikePct: 2,
  minPivotTouches: 3,
  minFinalContractionBars: 5,
  maxFinalVolumeRatio: 1,
  minSmaCrosses: 3,
  maxSma50DriftPct: 4,
  approachingThresholdPct: 5,
  minBreakoutVolumeRatio: 1.4,
  volumeAvgPeriod: 50,
  maxBuyRangePct: 5,
  breakoutLookbackDays: 3,
  trendTemplate: DEFAULT_TREND_TEMPLATE_CONFIG,
};

/** Relative-strength inputs that come from outside one symbol's own history. */
export interface BreakoutContext {
  /** RS Rating (1–99) against the scanned universe; null skips the Trend Template's RS check. */
  rsRating?: number | null;
  /** Benchmark (SPY) bars, for the RS line. */
  benchmarkBars?: DailyBar[];
}

export interface Base {
  pattern: BasePattern;
  pivot: number;
  startIndex: number;
  lengthBars: number;
  depthPct: number;
  contractions: Contraction[];
}

/** Times the close crossed the 50-day SMA (either direction) between `start` and `end`. */
function countSmaCrosses(bars: DailyBar[], start: number, end: number): number {
  let crosses = 0;
  let wasAbove: boolean | null = null;
  for (let i = start; i <= end; i++) {
    const smaAtI = sma(bars, HEARTBEAT_SMA_PERIOD, i);
    if (isNaN(smaAtI)) continue;
    const isAbove = bars[i].close > smaAtI;
    if (wasAbove !== null && isAbove !== wasAbove) crosses++;
    wasAbove = isAbove;
  }
  return crosses;
}

/**
 * The pivot's resistance level for a final contraction running from its
 * high at `start`, through its low at `lowIndex`, to `end`: normally that
 * high, but a few days spiking above the level price rallies back to after
 * the low, and keeps testing, don't count. The level is the highest high
 * since the low; it's the pivot when no more than `maxPivotSpikeBars` highs
 * sit above it, the peak clears it by more than `pivotSpikePct`, and at
 * least `minPivotTouches` bars after the spike come within 1% of it.
 */
export function resistanceLevel(
  bars: DailyBar[],
  config: BreakoutScreenConfig,
  start: number,
  lowIndex: number,
  end: number
): number {
  const peak = bars[start].high;
  if (lowIndex >= end) return peak;
  const level = Math.max(...bars.slice(lowIndex + 1, end + 1).map((b) => b.high));
  const above = bars.slice(start, end + 1).filter((b) => b.high > level);
  if (above.length > config.maxPivotSpikeBars || peak <= level * (1 + config.pivotSpikePct / 100)) return peak;

  let lastSpike = start;
  for (let i = start; i <= end; i++) if (bars[i].high > level) lastSpike = i;
  let touches = 0;
  for (let i = lastSpike + 1; i <= end; i++) if (bars[i].high >= level * (1 - RESISTANCE_TOUCH_PCT / 100)) touches++;
  return touches >= config.minPivotTouches ? level : peak;
}

/**
 * The left-side high of a base whose highest high is at `start`: normally
 * that high, but a few days spiking above a level price tested around them
 * don't count. Within `LEFT_SIDE_WINDOW` bars either side, the level is the
 * highest high left once up to `maxPivotSpikeBars` are set aside; it's the
 * left-side high when the peak clears it by more than `pivotSpikePct` and at
 * least `minPivotTouches` other bars come within 1% of it.
 */
export function leftSideHigh(bars: DailyBar[], config: BreakoutScreenConfig, start: number, end: number): number {
  const peak = bars[start].high;
  const window = bars.slice(Math.max(0, start - LEFT_SIDE_WINDOW), Math.min(end, start + LEFT_SIDE_WINDOW) + 1);
  const highs = window.map((b) => b.high).sort((a, b) => b - a);
  for (let k = 1; k <= config.maxPivotSpikeBars && k < highs.length; k++) {
    const level = highs[k];
    if (peak <= level * (1 + config.pivotSpikePct / 100)) continue;
    const touches = highs.slice(k).filter((h) => h >= level * (1 - RESISTANCE_TOUCH_PCT / 100)).length;
    if (touches >= config.minPivotTouches) return level;
  }
  return peak;
}

/** A flat base that chops back and forth across a flat 50-day SMA. */
function isHeartbeat(bars: DailyBar[], config: BreakoutScreenConfig, start: number, end: number): boolean {
  const smaNow = sma(bars, HEARTBEAT_SMA_PERIOD, end);
  const smaAtStart = sma(bars, HEARTBEAT_SMA_PERIOD, start);
  if (isNaN(smaNow) || isNaN(smaAtStart)) return false;
  const driftPct = Math.abs((smaNow - smaAtStart) / smaAtStart) * 100;
  return driftPct <= config.maxSma50DriftPct && countSmaCrosses(bars, start, end) >= config.minSmaCrosses;
}

/** 2–6 contractions. Each sits inside the one before, so they're already progressively shallower. */
function isProgressive(contractions: Contraction[], config: BreakoutScreenConfig): boolean {
  return contractions.length >= 2 && contractions.length <= config.maxContractions;
}

/**
 * Finds the base the stock is in as of `end`, or null if it isn't in one
 * that meets Minervini's rules. The base runs from its left-side peak (the
 * highest high of the last `maxBaseBars`) to `end`. The left-side high it's
 * measured from, and the pivot — the resistance level of the final
 * contraction — both ignore a few days that spike above resistance. The
 * final contraction must be tight, on drying-up volume.
 *
 * - Flat base: at least 5 weeks, no deeper than 15%, contracting.
 * - Heartbeat: a flat base whose closes chop across a flat 50-day SMA.
 * - Cup: at least 7 weeks, no deeper than 35%, contracting. A pause that
 *   forms once the right side is back near the left-side high is a handle
 *   ("cup-handle", in the upper half, no deeper than 12%, in a cup no
 *   deeper than 25%); a pause anywhere
 *   below that — lower, middle or upper third — is a "low-cheat".
 */
export function findBase(bars: DailyBar[], config: BreakoutScreenConfig, end: number): Base | null {
  let start = Math.max(0, end - config.maxBaseBars + 1);
  for (let i = start + 1; i <= end; i++) if (bars[i].high > bars[start].high) start = i;
  const lengthBars = end - start + 1;
  if (start === 0 || lengthBars < config.minFlatBaseBars) return null;

  const leftHigh = leftSideHigh(bars, config, start, end);
  const priorLow = lowestLow(bars, config.priorAdvanceLookback, start - 1);
  if ((leftHigh / priorLow - 1) * 100 < config.minPriorAdvancePct) return null;

  const baseLow = lowestLow(bars, lengthBars, end);
  const depthPct = ((leftHigh - baseLow) / leftHigh) * 100;

  const contractions = findContractions(bars, start, end, config.swingThresholdPct, config.minFinalContractionBars);
  // The first contraction runs from the left-side peak; measure it from the left-side high instead.
  const first = contractions[0];
  contractions[0] = { ...first, high: leftHigh, depthPct: ((leftHigh - first.low) / leftHigh) * 100 };
  const last = contractions[contractions.length - 1];
  const resistance = resistanceLevel(bars, config, last.highIndex, last.lowIndex, end);
  const pivot = last.highIndex === start ? Math.min(resistance, leftHigh) : resistance;
  // Tightness is measured from the resistance, so a spike doesn't make the contraction look deeper.
  const final = { ...last, high: pivot, depthPct: ((pivot - last.low) / pivot) * 100 };
  const finalBars = end - final.highIndex + 1;
  // Volume is judged on the pullback itself, not any rally back toward the pivot after it.
  const pullbackEnd = Math.min(end, Math.max(final.lowIndex, final.highIndex + config.minFinalContractionBars - 1));
  const finalVolume = averageVolume(bars, pullbackEnd - final.highIndex + 1, pullbackEnd);
  const priorVolume = averageVolume(bars, config.volumeAvgPeriod, final.highIndex - 1);
  const isTight =
    final.depthPct < config.maxFinalContractionPct &&
    finalBars >= config.minFinalContractionBars &&
    finalVolume <= priorVolume * config.maxFinalVolumeRatio;
  if (!isTight) return null;

  const base = { pivot, startIndex: start, lengthBars, depthPct, contractions: [...contractions.slice(0, -1), final] };

  if (depthPct <= config.maxFlatBaseDepthPct) {
    if (isHeartbeat(bars, config, start, end)) return { ...base, pattern: "heartbeat" };
    return isProgressive(contractions, config) ? { ...base, pattern: "flat-base" } : null;
  }

  if (depthPct > config.maxCupDepthPct || lengthBars < config.minCupBars) return null;
  if (!isProgressive(contractions, config)) return null;

  if (final.high < leftHigh * (1 - config.maxHandleBelowHighPct / 100)) return { ...base, pattern: "low-cheat" };
  const isHandle =
    depthPct <= config.maxCupHandleDepthPct &&
    final.low >= (leftHigh + baseLow) / 2 &&
    final.depthPct <= config.maxHandleDepthPct;
  return isHandle ? { ...base, pattern: "cup-handle" } : null;
}

/**
 * The most recent day in the trailing `lookbackDays` whose close crossed
 * above the pivot of the base that preceded it, with that base.
 */
function findBreakout(
  bars: DailyBar[],
  config: BreakoutScreenConfig,
  end: number
): { dayIndex: number; base: Base } | null {
  for (let d = end; d > end - config.breakoutLookbackDays && d >= 1; d--) {
    const base = findBase(bars, config, d - 1);
    if (base && bars[d].close > base.pivot && bars[d - 1].close <= base.pivot) return { dayIndex: d, base };
  }
  return null;
}

/**
 * Runs the Minervini breakout screen against one symbol's history. The
 * stock must pass the Trend Template, then either:
 * - triggered: closed above a valid base's pivot in the last few days and
 *   is still above it, or
 * - approaching: is in a valid base, within a few percent below its pivot.
 */
export function runBreakoutScreen(
  history: SymbolHistory,
  config: BreakoutScreenConfig = DEFAULT_BREAKOUT_CONFIG,
  name = "",
  context: BreakoutContext = {}
): BreakoutScreenResult | null {
  const { bars, symbol } = history;
  const end = bars.length - 1;
  if (end < 0) return null;
  const rsRating = context.rsRating ?? null;
  if (!passesTrendTemplate(bars, end, rsRating, config.trendTemplate)) return null;

  const close = bars[end].close;
  const breakout = findBreakout(bars, config, end);
  const base = breakout?.base ?? findBase(bars, config, end);
  if (!base) return null;

  const pctFromPivot = ((close - base.pivot) / base.pivot) * 100;
  const isTriggered = breakout !== null && close > base.pivot;
  if (!isTriggered && (close > base.pivot || pctFromPivot < -config.approachingThresholdPct)) return null;

  // On a breakout, volume is judged on the day it crossed the pivot.
  const volumeDay = isTriggered ? breakout.dayIndex : end;
  const volRatio = volumeRatio(bars, config.volumeAvgPeriod, volumeDay);
  const line = context.benchmarkBars ? rsLine(bars, context.benchmarkBars) : null;

  return {
    symbol,
    name,
    state: isTriggered ? "triggered" : "approaching",
    details: {
      close,
      sma50: sma(bars, 50, end),
      pattern: base.pattern,
      pivot: base.pivot,
      pctFromPivot,
      baseDepthPct: base.depthPct,
      baseLengthWeeks: Math.round(base.lengthBars / 5),
      contractions: base.contractions.map((c) => c.depthPct),
      volumeRatio: volRatio,
      volumeConfirmed: isTriggered && volRatio >= config.minBreakoutVolumeRatio,
      extended: pctFromPivot > config.maxBuyRangePct,
      daysSinceBreakout: isTriggered ? end - breakout.dayIndex : null,
      rsRating,
      rsLineNewHigh: line ? isRsLineAtNewHigh(line) : null,
    },
  };
}

/**
 * Runs the breakout screen across many symbols, ranking RS Ratings across
 * them, and splits the qualifying results into triggered vs. approaching.
 */
export function scanBreakoutScreen(
  histories: SymbolHistory[],
  config: BreakoutScreenConfig = DEFAULT_BREAKOUT_CONFIG,
  names: Record<string, string> = {},
  benchmarkBars?: DailyBar[]
): { triggered: BreakoutScreenResult[]; approaching: BreakoutScreenResult[] } {
  const ratings = rsRatings(histories);
  const results = histories
    .map((h) =>
      runBreakoutScreen(h, config, names[h.symbol] ?? "", { rsRating: ratings.get(h.symbol) ?? null, benchmarkBars })
    )
    .filter((r): r is BreakoutScreenResult => r !== null);

  const triggered = results
    .filter((r) => r.state === "triggered")
    .sort((a, b) => b.details.volumeRatio - a.details.volumeRatio);

  // Closest to the pivot first.
  const approaching = results
    .filter((r) => r.state === "approaching")
    .sort((a, b) => b.details.pctFromPivot - a.details.pctFromPivot);

  return { triggered, approaching };
}
