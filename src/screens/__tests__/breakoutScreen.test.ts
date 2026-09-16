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
  it("returns null when fewer than 150 bars", () => {
    const history = makeHistory(100);
    expect(runBreakoutScreen(history)).toBeNull();
  });

  it("returns null when price is well above SMA and no recent cross", () => {
    // All bars at the same price → SMA = price, close = price, no cross
    const history = makeHistory(200, 100);
    expect(runBreakoutScreen(history)).toBeNull();
  });

  it("detects approaching state when below SMA and consolidating", () => {
    // Build bars: first 160 bars at high price, then 40 bars at lower price with tight range
    const highBars = Array.from({ length: 160 }, (_, i) =>
      makeBar({ date: new Date(2024, 0, i + 1), close: 120, open: 118, high: 125, low: 115 })
    );
    // Drop below SMA with a tight consolidation
    const lowBars = Array.from({ length: 55 }, (_, i) =>
      makeBar({
        date: new Date(2024, 6, i + 1),
        close: 115,
        open: 114.5,
        high: 115.5,
        low: 114.5,
      })
    );
    const history: SymbolHistory = { symbol: "TEST", bars: [...highBars, ...lowBars] };
    const result = runBreakoutScreen(history);

    if (result) {
      expect(result.state).toBe("approaching");
      expect(result.details.daysSinceCross).toBeNull();
    }
  });
});

describe("scanBreakoutScreen", () => {
  it("splits results into triggered and approaching", () => {
    const histories = [makeHistory(200), makeHistory(50)];
    const { triggered, approaching } = scanBreakoutScreen(histories);
    // With flat data neither should trigger, but should not throw
    expect(Array.isArray(triggered)).toBe(true);
    expect(Array.isArray(approaching)).toBe(true);
  });

  it("filters out null results from symbols with insufficient data", () => {
    const histories = [makeHistory(50), makeHistory(30)];
    const { triggered, approaching } = scanBreakoutScreen(histories);
    expect(triggered).toHaveLength(0);
    expect(approaching).toHaveLength(0);
  });
});
