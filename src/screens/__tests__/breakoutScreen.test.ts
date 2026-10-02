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

/** Wide-ranged bars at a steady 120 — keeps the 50-day SMA flat and serves as the "prior period". */
function flatBars(count: number, range: { high?: number; low?: number } = {}) {
  return Array.from({ length: count }, (_, i) =>
    makeBar({ date: new Date(2024, 0, i + 1), close: 120, open: 119, high: range.high ?? 128, low: range.low ?? 112 })
  );
}

/** A tight heartbeat: closes alternate 121/118 every 3 days across the ~120 SMA, ending on 118 (just below it). */
function heartbeatBars(count: number, range: { high?: number; low?: number } = {}) {
  return Array.from({ length: count }, (_, i) =>
    makeBar({
      date: new Date(2024, 3, i + 1),
      close: Math.floor(i / 3) % 2 === 0 ? 121 : 118,
      open: 119.5,
      high: range.high ?? 121.5,
      low: range.low ?? 117.5,
    })
  );
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

  it("detects approaching state when chopping across a flat SMA and ending just below it", () => {
    const history: SymbolHistory = { symbol: "TEST", bars: [...flatBars(60), ...heartbeatBars(30)] };
    const result = runBreakoutScreen(history);

    expect(result).not.toBeNull();
    expect(result?.state).toBe("approaching");
    expect(result?.details.daysSinceCross).toBeNull();
  });

  it("skips approaching when price has only just dipped through the SMA once", () => {
    // Held above the SMA for 27 days then slipped under it — a pullback, not a heartbeat.
    const pullbackBars = Array.from({ length: 30 }, (_, i) =>
      makeBar({ date: new Date(2024, 3, i + 1), close: i < 27 ? 121 : 118, high: 121.5, low: 117.5 })
    );
    const history: SymbolHistory = { symbol: "TEST", bars: [...flatBars(60), ...pullbackBars] };

    expect(runBreakoutScreen(history)).toBeNull();
    expect(runBreakoutScreen(history, { ...DEFAULT_BREAKOUT_CONFIG, minSmaCrosses: 1 })?.state).toBe("approaching");
  });

  it("triggers when the cross closes above the consolidation high on heavy volume", () => {
    const crossBar = makeBar({ date: new Date(2024, 4, 1), close: 123, open: 118, high: 123.5, low: 118, volume: 3_000_000 });
    const history: SymbolHistory = { symbol: "TEST", bars: [...flatBars(60), ...heartbeatBars(30), crossBar] };
    const result = runBreakoutScreen(history);

    expect(result?.state).toBe("triggered");
    expect(result?.details.daysSinceCross).toBe(0);
  });

  it("does not trigger when the cross closes inside the consolidation range", () => {
    // Consolidation highs reach 123.5, above the breakout close.
    const crossBar = makeBar({ date: new Date(2024, 4, 1), close: 123, open: 118, high: 123.2, low: 118, volume: 3_000_000 });
    const history: SymbolHistory = {
      symbol: "TEST",
      bars: [...flatBars(60), ...heartbeatBars(30, { high: 123.5 }), crossBar],
    };

    expect(runBreakoutScreen(history)).toBeNull();
  });

  it("skips approaching when the range is wider than the prior period", () => {
    // Prior range is 6/115 ≈ 5.2%; the last 30 bars span 9/114 ≈ 7.9% — under the width cap, but widening.
    const history: SymbolHistory = {
      symbol: "TEST",
      bars: [...flatBars(60, { high: 121, low: 115 }), ...heartbeatBars(30, { high: 123, low: 114 })],
    };

    expect(runBreakoutScreen(history)).toBeNull();
    expect(runBreakoutScreen(history, { ...DEFAULT_BREAKOUT_CONFIG, maxContractionRatio: 2 })?.state).toBe(
      "approaching"
    );
  });

  it("skips approaching when the range has narrowed but is still wider than 10%", () => {
    // Prior range is 50/100 = 50%; the last 30 bars span 13.5/108 = 12.5% — well contracted, but not tight.
    const history: SymbolHistory = {
      symbol: "TEST",
      bars: [...flatBars(60, { high: 150, low: 100 }), ...heartbeatBars(30, { low: 108 })],
    };

    expect(runBreakoutScreen(history)).toBeNull();
    expect(runBreakoutScreen(history, { ...DEFAULT_BREAKOUT_CONFIG, maxRangePct: 15 })?.state).toBe("approaching");
  });

  it("skips approaching when the 50-day SMA isn't flat across the consolidation", () => {
    // An older trend high rolling out of the window drags the 50-day SMA down ~4.6% over the 30 days,
    // while a wider 125/115 chop keeps crossing it — sawing along a slope rather than moving sideways.
    const highBars = Array.from({ length: 50 }, (_, i) =>
      makeBar({ date: new Date(2023, 10, i + 1), close: 130, open: 128, high: 135, low: 125 })
    );
    const slopedChopBars = Array.from({ length: 30 }, (_, i) =>
      makeBar({ date: new Date(2024, 3, i + 1), close: Math.floor(i / 3) % 2 === 0 ? 125 : 115, high: 125.5, low: 114.5 })
    );
    const history: SymbolHistory = { symbol: "TEST", bars: [...highBars, ...flatBars(20), ...slopedChopBars] };

    expect(runBreakoutScreen(history)).toBeNull();
    expect(runBreakoutScreen(history, { ...DEFAULT_BREAKOUT_CONFIG, maxSma50DriftPct: 6 })?.state).toBe(
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
