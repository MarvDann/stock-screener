import { DailyBar } from "../types";
import { resampleBars } from "./resample";
import { sma } from "./movingAverage";

/**
 * Stan Weinstein's four stages, read off the weekly chart against the
 * 30-week moving average:
 *  1. Basing — the average flattens out after a decline, price chops around it.
 *  2. Advancing — price above a rising average.
 *  3. Topping — the average flattens out after an advance, price chops around it.
 *  4. Declining — price below a falling average.
 */
export type WeinsteinStageNumber = 1 | 2 | 3 | 4;

export interface WeinsteinStage {
  stage: WeinsteinStageNumber;
  label: "Basing" | "Advancing" | "Topping" | "Declining";
  /** Consecutive weeks, including this one, the stock has been in this stage (at least this many). */
  weeks: number;
  /** The 30-week SMA's latest value. */
  ma30: number;
  /** % change in the 30-week SMA over the last SLOPE_WEEKS weeks. */
  maSlopePct: number;
  /** % the latest weekly close sits above (or below) the 30-week SMA. */
  pctFromMa: number;
}

const MA_WEEKS = 30;
/** How far back the 30-week SMA's direction is measured. */
const SLOPE_WEEKS = 5;
/** A move in the SMA smaller than this, over SLOPE_WEEKS, counts as flat. */
const FLAT_SLOPE_PCT = 1;

const LABELS: Record<WeinsteinStageNumber, WeinsteinStage["label"]> = {
  1: "Basing",
  2: "Advancing",
  3: "Topping",
  4: "Declining",
};

type Slope = "rising" | "falling" | "flat";

/**
 * Each week's stage, oldest first, from the first week with enough history:
 *  - price above a rising SMA is stage 2, below a falling one stage 4;
 *  - a flat SMA is a top (3) after an advance or a base (1) after a decline;
 *  - price on the "wrong" side of a sloping SMA (a pullback in an advance, a
 *    rally in a decline) keeps the previous week's stage.
 * Before any clear trend, the SMA's direction since the start of the data decides.
 */
function weeklyStages(weekly: DailyBar[]): { stage: WeinsteinStageNumber; ma: number; slopePct: number }[] {
  const stages: { stage: WeinsteinStageNumber; ma: number; slopePct: number }[] = [];
  const firstIndex = MA_WEEKS - 1 + SLOPE_WEEKS;
  const startMa = sma(weekly, MA_WEEKS, firstIndex - SLOPE_WEEKS);
  let lastTrend: "up" | "down" | null = null;
  for (let i = firstIndex; i < weekly.length; i++) {
    const ma = sma(weekly, MA_WEEKS, i);
    const prior = sma(weekly, MA_WEEKS, i - SLOPE_WEEKS);
    if (!prior) continue;
    const slopePct = (ma / prior - 1) * 100;
    const slope: Slope = slopePct > FLAT_SLOPE_PCT ? "rising" : slopePct < -FLAT_SLOPE_PCT ? "falling" : "flat";
    const close = weekly[i].close;
    const previous = stages.at(-1)?.stage;
    let stage: WeinsteinStageNumber;
    if (slope === "rising" && close > ma) {
      stage = 2;
      lastTrend = "up";
    } else if (slope === "falling" && close < ma) {
      stage = 4;
      lastTrend = "down";
    } else if (slope === "flat") {
      const cameFrom = lastTrend ?? (ma >= startMa ? "up" : "down");
      stage = cameFrom === "up" ? 3 : 1;
    } else if (previous) {
      stage = previous;
    } else {
      stage = slope === "rising" ? 2 : 4;
    }
    stages.push({ stage, ma, slopePct });
  }
  return stages;
}

/**
 * The stock's current Weinstein stage from its daily bars (oldest first),
 * or null with under ~35 weeks of history. The latest week counts as it
 * stands so far.
 */
export function weinsteinStage(dailyBars: DailyBar[]): WeinsteinStage | null {
  const weekly = resampleBars(dailyBars, "weekly");
  const stages = weeklyStages(weekly);
  const latest = stages.at(-1);
  if (!latest) return null;
  let weeks = 0;
  for (let i = stages.length - 1; i >= 0 && stages[i].stage === latest.stage; i--) weeks++;
  const close = weekly[weekly.length - 1].close;
  return {
    stage: latest.stage,
    label: LABELS[latest.stage],
    weeks,
    ma30: latest.ma,
    maSlopePct: latest.slopePct,
    pctFromMa: (close / latest.ma - 1) * 100,
  };
}
