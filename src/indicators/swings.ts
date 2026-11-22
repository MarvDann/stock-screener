import { DailyBar } from "../types";

export interface Swing {
  type: "high" | "low";
  index: number;
  price: number;
}

/** One pullback within a base: from a swing high down to the lowest low before the next contraction starts. */
export interface Contraction {
  highIndex: number;
  high: number;
  lowIndex: number;
  low: number;
  /** (high - low) / high * 100. */
  depthPct: number;
}

/**
 * Zigzag swing points between `start` and `end`, using bar highs for swing
 * highs and lows for swing lows. A swing is confirmed once price reverses by
 * `thresholdPct` from it. Starts by tracking a high (callers pass a base's
 * left-side high as `start`); the last point is the unconfirmed extreme.
 */
export function zigzag(bars: DailyBar[], start: number, end: number, thresholdPct: number): Swing[] {
  const t = thresholdPct / 100;
  const swings: Swing[] = [];
  let candidate: Swing = { type: "high", index: start, price: bars[start].high };
  for (let i = start + 1; i <= end; i++) {
    const bar = bars[i];
    if (candidate.type === "high") {
      if (bar.high >= candidate.price) candidate = { type: "high", index: i, price: bar.high };
      else if (bar.low <= candidate.price * (1 - t)) {
        swings.push(candidate);
        candidate = { type: "low", index: i, price: bar.low };
      }
    } else {
      if (bar.low <= candidate.price) candidate = { type: "low", index: i, price: bar.low };
      else if (bar.high >= candidate.price * (1 + t)) {
        swings.push(candidate);
        candidate = { type: "high", index: i, price: bar.high };
      }
    }
  }
  swings.push(candidate);
  return swings;
}

/**
 * The successive pullbacks (Minervini's "T"s) in a base starting at its
 * left-side high `start`, each contained within the one before — lower
 * highs, higher lows:
 * - A pullback that undercuts an earlier contraction's low continues that
 *   decline, so the two merge.
 * - A rally past an earlier contraction's high (e.g. wiggles up the right
 *   side of a cup) means that contraction is no longer part of the pattern,
 *   so it's dropped.
 * The last contraction runs to `end`. A swing high that price hasn't yet
 * pulled back from only counts once `minTailBars` bars have passed — before
 * then the stock is still running up, not contracting.
 */
export function findContractions(
  bars: DailyBar[],
  start: number,
  end: number,
  thresholdPct: number,
  minTailBars = 1
): Contraction[] {
  const swings = zigzag(bars, start, end, thresholdPct);
  const stack: Omit<Contraction, "depthPct">[] = [];
  for (let k = 0; k < swings.length; k++) {
    const high = swings[k];
    if (high.type !== "high") continue;
    const isTail = k === swings.length - 1;
    if (isTail && k > 0 && end - high.index + 1 < minTailBars) continue;
    const low = swings[k + 1] ?? lowestLowAfter(bars, high.index, end);
    let c = { highIndex: high.index, high: high.price, lowIndex: low.index, low: low.price };
    while (stack.length > 0) {
      const prev = stack[stack.length - 1];
      if (c.low < prev.low) {
        stack.pop();
        if (prev.high >= c.high) c = { ...c, highIndex: prev.highIndex, high: prev.high };
      } else if (prev.high < c.high) {
        stack.pop();
      } else break;
    }
    stack.push(c);
  }
  return stack.map((c) => ({ ...c, depthPct: ((c.high - c.low) / c.high) * 100 }));
}

/** Lowest low in [from, end] — the still-forming bottom of the last contraction. */
function lowestLowAfter(bars: DailyBar[], from: number, end: number): Swing {
  let best: Swing = { type: "low", index: from, price: bars[from].low };
  for (let i = from + 1; i <= end; i++) {
    if (bars[i].low < best.price) best = { type: "low", index: i, price: bars[i].low };
  }
  return best;
}
