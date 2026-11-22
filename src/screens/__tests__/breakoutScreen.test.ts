import { describe, it, expect } from "vitest";
import { findBase, runBreakoutScreen, scanBreakoutScreen, DEFAULT_BREAKOUT_CONFIG } from "../breakoutScreen";
import { makeBar } from "../../__tests__/helpers";
import { DailyBar, SymbolHistory } from "../../types";

/** A leg of a price path: move linearly to `to` over `bars` bars, at `volume` a day. */
type Leg = { to: number; bars: number; volume?: number };

/** Bars following `legs` from `start`, with highs/lows 0.5% either side of each close. */
function path(start: number, legs: Leg[]): DailyBar[] {
  const bars: DailyBar[] = [];
  let price = start;
  for (const leg of legs) {
    const from = price;
    for (let i = 1; i <= leg.bars; i++) {
      price = from + ((leg.to - from) * i) / leg.bars;
      bars.push(
        makeBar({
          date: new Date(2024, 0, 1 + bars.length),
          close: price,
          open: price,
          high: price * 1.005,
          low: price * 0.995,
          volume: leg.volume ?? 1_000_000,
        })
      );
    }
  }
  return bars;
}

/** A year-long Stage 2 advance from 40 to 100 — passes the Trend Template on its own. */
const UPTREND: Leg[] = [{ to: 100, bars: 250 }];

/** 3T cup with handle: 18% cup, 7% pullback, then a ~2.5% handle on drying volume. Pivot ≈ 97.5. */
const CUP_WITH_HANDLE: Leg[] = [
  ...UPTREND,
  { to: 82, bars: 20 },
  { to: 98, bars: 25 },
  { to: 91.5, bars: 6 },
  { to: 97, bars: 4 },
  { to: 95.5, bars: 6, volume: 500_000 },
];

/** 2T flat base: a 10% correction then a ~2.5% pause on light volume. Pivot ≈ 98.5. */
const FLAT_BASE: Leg[] = [
  ...UPTREND,
  { to: 90.5, bars: 12 },
  { to: 98, bars: 12 },
  { to: 96.5, bars: 6, volume: 500_000 },
];

const history = (legs: Leg[], extra: DailyBar[] = []): SymbolHistory => ({
  symbol: "TEST",
  bars: [...path(40, legs), ...extra],
});

/** A bar after `bars` closing at `close`, on `volume`. */
function nextBar(bars: DailyBar[], close: number, volume = 2_000_000): DailyBar {
  return makeBar({
    date: new Date(2025, 0, 1 + bars.length),
    close,
    open: close,
    high: close * 1.005,
    low: close * 0.995,
    volume,
  });
}

describe("findBase", () => {
  const end = (h: SymbolHistory) => h.bars.length - 1;

  it("finds a cup with handle, with the handle's high as the pivot", () => {
    const h = history(CUP_WITH_HANDLE);
    const base = findBase(h.bars, DEFAULT_BREAKOUT_CONFIG, end(h));

    expect(base?.pattern).toBe("cup-handle");
    expect(base?.contractions).toHaveLength(3);
    expect(base?.pivot).toBeCloseTo(97 * 1.005);
    expect(base?.depthPct).toBeGreaterThan(15);
  });

  it("finds a flat base", () => {
    const h = history(FLAT_BASE);
    expect(findBase(h.bars, DEFAULT_BREAKOUT_CONFIG, end(h))?.pattern).toBe("flat-base");
  });

  it("names a pause in the lower third of a cup a low cheat", () => {
    // 30% cup off 100.5, rallying to ~76 before a tight pause.
    const h = history([...UPTREND, { to: 70, bars: 25 }, { to: 76, bars: 10 }, { to: 74.5, bars: 6, volume: 500_000 }]);
    expect(findBase(h.bars, DEFAULT_BREAKOUT_CONFIG, end(h))?.pattern).toBe("low-cheat");
  });

  it("names a pause in the middle third of a cup a low cheat", () => {
    const h = history([...UPTREND, { to: 70, bars: 25 }, { to: 86, bars: 10 }, { to: 84.5, bars: 6, volume: 500_000 }]);
    expect(findBase(h.bars, DEFAULT_BREAKOUT_CONFIG, end(h))?.pattern).toBe("low-cheat");
  });

  it("names a pause in the upper third of a cup, short of the handle area, a low cheat", () => {
    // Pivot ~92.5 is in the upper third of a 70–100.5 cup but ~8% below the left-side high.
    const h = history([...UPTREND, { to: 70, bars: 25 }, { to: 92, bars: 12 }, { to: 90.5, bars: 6, volume: 500_000 }]);
    expect(findBase(h.bars, DEFAULT_BREAKOUT_CONFIG, end(h))?.pattern).toBe("low-cheat");
    expect(findBase(h.bars, { ...DEFAULT_BREAKOUT_CONFIG, maxHandleBelowHighPct: 10 }, end(h))?.pattern).toBe("cup-handle");
  });

  it("finds a heartbeat: a flat base chopping across a flat 50-day SMA", () => {
    // Equal-sized swings across ~95 aren't contracting, so it's only valid as a heartbeat.
    const chop: Leg[] = [];
    for (let i = 0; i < 6; i++) chop.push({ to: 92, bars: 5 }, { to: 98, bars: 5 });
    const h = history([...UPTREND, { to: 95, bars: 40 }, ...chop, { to: 96.5, bars: 6, volume: 500_000 }]);
    const base = findBase(h.bars, DEFAULT_BREAKOUT_CONFIG, end(h));

    expect(base?.pattern).toBe("heartbeat");
    expect(findBase(h.bars, { ...DEFAULT_BREAKOUT_CONFIG, minSmaCrosses: 99 }, end(h))).toBeNull();
  });

  it("drops a pullback that price later rallies past, like a wiggle up the right side of a cup", () => {
    // 95→90 is surpassed by the rally to 100, so it isn't one of the base's contractions.
    const h = history([
      ...UPTREND,
      { to: 85, bars: 12 },
      { to: 95, bars: 10 },
      { to: 90, bars: 5 },
      { to: 100, bars: 8 },
      { to: 91, bars: 8 },
      { to: 96, bars: 5 },
      { to: 94.8, bars: 6, volume: 500_000 },
    ]);
    const base = findBase(h.bars, DEFAULT_BREAKOUT_CONFIG, end(h));
    expect(base?.contractions.map((c) => c.high.toFixed(1))).toEqual(["100.5", "100.5", "96.5"]);
  });

  it("rejects a base with more than 6 contractions", () => {
    const h = history(CUP_WITH_HANDLE);
    expect(findBase(h.bars, { ...DEFAULT_BREAKOUT_CONFIG, maxContractions: 2 }, end(h))).toBeNull();
  });

  it("keeps the pivot at the last contraction's high while price rallies back toward it", () => {
    // Up off the handle's low for 3 days: too soon to be a new contraction.
    const h = history([...FLAT_BASE.slice(0, -1), { to: 94, bars: 6, volume: 500_000 }, { to: 97.5, bars: 3 }]);
    const base = findBase(h.bars, DEFAULT_BREAKOUT_CONFIG, end(h));
    expect(base?.pivot).toBeCloseTo(98 * 1.005);
  });

  it("rejects a handle deeper than 12%", () => {
    // A 30% cup whose final pullback from 98 to 86 is ~13% deep, though it forms in the handle area.
    const h = history([...UPTREND, { to: 70, bars: 25 }, { to: 98, bars: 25 }, { to: 86, bars: 8, volume: 500_000 }]);
    const lenient = { ...DEFAULT_BREAKOUT_CONFIG, maxFinalContractionPct: 20 };

    expect(findBase(h.bars, lenient, end(h))).toBeNull();
    expect(findBase(h.bars, { ...lenient, maxHandleDepthPct: 20 }, end(h))?.pattern).toBe("cup-handle");
  });

  it("rejects a base without volume drying up in the final contraction", () => {
    const legs = FLAT_BASE.map((leg, i) => (i === FLAT_BASE.length - 1 ? { ...leg, volume: 1_500_000 } : leg));
    const h = history(legs);
    expect(findBase(h.bars, DEFAULT_BREAKOUT_CONFIG, end(h))).toBeNull();
  });

  it("rejects a final contraction that isn't tight", () => {
    const h = history(FLAT_BASE);
    expect(findBase(h.bars, { ...DEFAULT_BREAKOUT_CONFIG, maxFinalContractionPct: 1 }, end(h))).toBeNull();
  });

  it("rejects a stock still running up from its last low", () => {
    // Rally into the last bar: the "final contraction" is a day old.
    const h = history([...UPTREND, { to: 90.5, bars: 12 }, { to: 98, bars: 12 }]);
    expect(findBase(h.bars, DEFAULT_BREAKOUT_CONFIG, end(h))).toBeNull();
  });

  it("rejects a base shorter than 5 weeks", () => {
    const h = history([...UPTREND, { to: 92, bars: 8 }, { to: 98, bars: 8 }, { to: 96.5, bars: 6, volume: 500_000 }]);
    expect(findBase(h.bars, DEFAULT_BREAKOUT_CONFIG, end(h))).toBeNull();
  });

  it("rejects a base without a prior advance into it", () => {
    const h = history(FLAT_BASE);
    expect(findBase(h.bars, { ...DEFAULT_BREAKOUT_CONFIG, minPriorAdvancePct: 200 }, end(h))).toBeNull();
  });
});

describe("runBreakoutScreen", () => {
  it("returns null without enough history for the Trend Template", () => {
    expect(runBreakoutScreen({ symbol: "TEST", bars: path(40, [{ to: 60, bars: 100 }]) })).toBeNull();
  });

  it("is approaching when in a valid base just below the pivot", () => {
    const result = runBreakoutScreen(history(CUP_WITH_HANDLE));

    expect(result?.state).toBe("approaching");
    expect(result?.details.pattern).toBe("cup-handle");
    expect(result?.details.pctFromPivot).toBeLessThan(0);
    expect(result?.details.daysSinceBreakout).toBeNull();
  });

  it("triggers once the close crosses the pivot, flagging volume confirmation", () => {
    const base = history(FLAT_BASE);
    const heavy = runBreakoutScreen({ ...base, bars: [...base.bars, nextBar(base.bars, 100, 2_000_000)] });
    const light = runBreakoutScreen({ ...base, bars: [...base.bars, nextBar(base.bars, 100, 900_000)] });

    expect(heavy?.state).toBe("triggered");
    expect(heavy?.details.daysSinceBreakout).toBe(0);
    expect(heavy?.details.volumeConfirmed).toBe(true);
    expect(light?.state).toBe("triggered");
    expect(light?.details.volumeConfirmed).toBe(false);
  });

  it("flags a breakout more than 5% past the pivot as extended", () => {
    const base = history(FLAT_BASE);
    const result = runBreakoutScreen({ ...base, bars: [...base.bars, nextBar(base.bars, 105)] });

    expect(result?.state).toBe("triggered");
    expect(result?.details.extended).toBe(true);
  });

  it("drops a breakout that has fallen back below the pivot to approaching", () => {
    const base = history(FLAT_BASE);
    const bars = [...base.bars, nextBar(base.bars, 100)];
    bars.push(nextBar(bars, 97.5));

    expect(runBreakoutScreen({ ...base, bars })?.state).toBe("approaching");
  });

  it("requires the Trend Template's RS Rating", () => {
    const h = history(CUP_WITH_HANDLE);
    expect(runBreakoutScreen(h, DEFAULT_BREAKOUT_CONFIG, "", { rsRating: 69 })).toBeNull();
    expect(runBreakoutScreen(h, DEFAULT_BREAKOUT_CONFIG, "", { rsRating: 70 })?.details.rsRating).toBe(70);
  });

  it("returns null for a valid base in a stock that isn't in an uptrend", () => {
    // The same flat base, but after a year of decline.
    const h = { symbol: "TEST", bars: path(200, [{ to: 100, bars: 250 }, ...FLAT_BASE.slice(1)]) };
    expect(runBreakoutScreen(h)).toBeNull();
  });

  it("reports whether the RS line is at a new high", () => {
    const h = history(FLAT_BASE);
    const flatBenchmark = h.bars.map((b) => ({ ...b, close: 100 }));
    expect(runBreakoutScreen(h, DEFAULT_BREAKOUT_CONFIG, "", { benchmarkBars: flatBenchmark })?.details.rsLineNewHigh).toBe(false);

    const collapsingBenchmark = h.bars.map((b, i) => ({ ...b, close: i === h.bars.length - 1 ? 1 : 100 }));
    expect(
      runBreakoutScreen(h, DEFAULT_BREAKOUT_CONFIG, "", { benchmarkBars: collapsingBenchmark })?.details.rsLineNewHigh
    ).toBe(true);
  });
});

describe("scanBreakoutScreen", () => {
  it("splits results into triggered and approaching, ranking RS across the scan", () => {
    const breakout = history(FLAT_BASE);
    breakout.bars.push(nextBar(breakout.bars, 100));
    // Laggards to rank against, so both base stocks rate above 70.
    const laggards = [100, 90, 80].map((start, i) => ({ symbol: `LAG${i}`, bars: path(start, [{ to: 50, bars: 300 }]) }));

    const { triggered, approaching } = scanBreakoutScreen([
      { ...breakout, symbol: "BRK" },
      { ...history(CUP_WITH_HANDLE), symbol: "CUP" },
      ...laggards,
    ]);

    expect(triggered.map((r) => r.symbol)).toEqual(["BRK"]);
    expect(approaching.map((r) => r.symbol)).toEqual(["CUP"]);
    expect(triggered[0].details.rsRating).toBe(99);
  });

  it("skips symbols with too little history", () => {
    const { triggered, approaching } = scanBreakoutScreen([{ symbol: "NEW", bars: path(40, [{ to: 60, bars: 40 }]) }]);
    expect(triggered).toHaveLength(0);
    expect(approaching).toHaveLength(0);
  });
});
