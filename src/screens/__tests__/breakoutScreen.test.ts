import { describe, it, expect } from "vitest";
import { runBreakoutScreen, scanBreakoutScreen, DEFAULT_BREAKOUT_CONFIG } from "../breakoutScreen";
import { makeBar } from "../../__tests__/helpers";
import { SymbolHistory } from "../../types";

function makeHistory(barCount: number, closeValue = 100): SymbolHistory {
  const bars = Array.from({ length: barCount }, (_, i) =>
    makeBar({
      date: new Date(2024, 0, 2 + i),
      close: closeValue,
      open: closeValue - 1,
      high: closeValue + 3,
      low: closeValue - 3,
    })
  );
  return { symbol: "TEST", bars };
}

describe("runBreakoutScreen", () => {
  it("returns null when fewer than 50 bars", () => {
    const history = makeHistory(30);
    expect(runBreakoutScreen(history)).toBeNull();
  });

  it("returns null when price is well above SMA and no recent cross", () => {
    // All bars at the same price → SMA = price, close = price, no cross
    const history = makeHistory(80, 100);
    expect(runBreakoutScreen(history)).toBeNull();
  });

  it("detects approaching state when below a leveled-out SMA and consolidating", () => {
    // 60 wide-ranged bars at a steady price keep the 50-day SMA flat — the "prior period" for the contraction check.
    const flatBars = Array.from({ length: 60 }, (_, i) =>
      makeBar({ date: new Date(2024, 0, i + 1), close: 120, open: 119, high: 128, low: 112 })
    );
    // Last 15 bars tighten up close to (but below) the flat 50-day SMA.
    const tightBars = Array.from({ length: 15 }, (_, i) =>
      makeBar({ date: new Date(2024, 3, i + 1), close: 118, open: 117.8, high: 118.5, low: 117.5 })
    );
    const history: SymbolHistory = { symbol: "TEST", bars: [...flatBars, ...tightBars] };
    const result = runBreakoutScreen(history);

    expect(result).not.toBeNull();
    expect(result?.state).toBe("approaching");
    expect(result?.details.daysSinceCross).toBeNull();
  });

  it("skips approaching when the 50-day SMA is still declining", () => {
    // An older trend high rolling out of the window drags the 50-day SMA down ~2% over 10 days.
    const highBars = Array.from({ length: 50 }, (_, i) =>
      makeBar({ date: new Date(2024, 0, i + 1), close: 130, open: 128, high: 135, low: 125 })
    );
    const midBars = Array.from({ length: 35 }, (_, i) =>
      makeBar({ date: new Date(2024, 3, i + 1), close: 120, open: 119, high: 128, low: 112 })
    );
    const lowBars = Array.from({ length: 15 }, (_, i) =>
      makeBar({ date: new Date(2024, 6, i + 1), close: 118, open: 117.8, high: 118.5, low: 117.5 })
    );
    const history: SymbolHistory = { symbol: "TEST", bars: [...highBars, ...midBars, ...lowBars] };

    expect(runBreakoutScreen(history)).toBeNull();
    expect(runBreakoutScreen(history, { ...DEFAULT_BREAKOUT_CONFIG, minSma50SlopePct: -5 })?.state).toBe(
      "approaching"
    );
  });
});

describe("scanBreakoutScreen", () => {
  it("splits results into triggered and approaching", () => {
    const histories = [makeHistory(80), makeHistory(50)];
    const { triggered, approaching } = scanBreakoutScreen(histories);
    // With flat data neither should trigger, but should not throw
    expect(Array.isArray(triggered)).toBe(true);
    expect(Array.isArray(approaching)).toBe(true);
  });

  it("filters out null results from symbols with insufficient data", () => {
    const histories = [makeHistory(40), makeHistory(30)];
    const { triggered, approaching } = scanBreakoutScreen(histories);
    expect(triggered).toHaveLength(0);
    expect(approaching).toHaveLength(0);
  });
});
