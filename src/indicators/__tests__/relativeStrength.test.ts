import { describe, it, expect } from "vitest";
import {
  mansfieldRelativeStrength,
  moneyFlowScore,
  classifyMoneyFlow,
  classifyCapitalFlow,
  isRsLineAtNewHigh,
  rsLine,
  rsRatings,
} from "../relativeStrength";
import { makeBar } from "../../__tests__/helpers";

describe("mansfieldRelativeStrength", () => {
  it("returns positive when symbol outperforms its own trend vs benchmark", () => {
    const symbol = Array.from({ length: 201 }, (_, i) =>
      makeBar({ close: 100 + i * 0.3 })
    );
    const benchmark = Array.from({ length: 201 }, (_, i) =>
      makeBar({ close: 100 + i * 0.1 })
    );
    expect(mansfieldRelativeStrength(symbol, benchmark, 200)).toBeGreaterThan(0);
  });

  it("returns NaN when fewer than period bars available", () => {
    const bars = Array.from({ length: 50 }, () => makeBar({ close: 100 }));
    expect(mansfieldRelativeStrength(bars, bars, 200)).toBeNaN();
  });

  it("returns ~0 when symbol and benchmark move identically", () => {
    const bars = Array.from({ length: 201 }, (_, i) =>
      makeBar({ close: 100 + i * 0.1 })
    );
    expect(mansfieldRelativeStrength(bars, bars, 200)).toBeCloseTo(0);
  });
});

describe("moneyFlowScore", () => {
  it("returns positive when closes are near the highs", () => {
    const bars = Array.from({ length: 10 }, () =>
      makeBar({ high: 110, low: 90, close: 108 })
    );
    expect(moneyFlowScore(bars, 10)).toBeGreaterThan(0);
  });

  it("returns negative when closes are near the lows", () => {
    const bars = Array.from({ length: 10 }, () =>
      makeBar({ high: 110, low: 90, close: 92 })
    );
    expect(moneyFlowScore(bars, 10)).toBeLessThan(0);
  });

  it("returns NaN when all volume is 0", () => {
    const bars = Array.from({ length: 5 }, () =>
      makeBar({ volume: 0 })
    );
    expect(moneyFlowScore(bars, 5)).toBeNaN();
  });

  it("returns 0 when close is at the midpoint of the range", () => {
    const bars = Array.from({ length: 5 }, () =>
      makeBar({ high: 110, low: 90, close: 100, volume: 1000 })
    );
    expect(moneyFlowScore(bars, 5)).toBeCloseTo(0);
  });
});

describe("classifyMoneyFlow", () => {
  it("returns accumulation when score > 0.05", () => {
    expect(classifyMoneyFlow(0.1)).toBe("accumulation");
  });

  it("returns distribution when score < -0.05", () => {
    expect(classifyMoneyFlow(-0.1)).toBe("distribution");
  });

  it("returns neutral when score is between -0.05 and 0.05", () => {
    expect(classifyMoneyFlow(0.03)).toBe("neutral");
    expect(classifyMoneyFlow(-0.03)).toBe("neutral");
  });

  it("returns neutral for NaN", () => {
    expect(classifyMoneyFlow(NaN)).toBe("neutral");
  });
});

describe("classifyCapitalFlow", () => {
  it("returns accumulating when RS > 0 and money flow is accumulation", () => {
    expect(classifyCapitalFlow(5, "accumulation")).toBe("accumulating");
  });

  it("returns distributing when RS < 0 and money flow is distribution", () => {
    expect(classifyCapitalFlow(-3, "distribution")).toBe("distributing");
  });

  it("returns neutral when signals disagree", () => {
    expect(classifyCapitalFlow(5, "distribution")).toBe("neutral");
    expect(classifyCapitalFlow(-3, "accumulation")).toBe("neutral");
  });

  it("returns neutral when RS is NaN", () => {
    expect(classifyCapitalFlow(NaN, "accumulation")).toBe("neutral");
  });

  it("returns neutral when money flow is neutral", () => {
    expect(classifyCapitalFlow(5, "neutral")).toBe("neutral");
  });
});

describe("rsRatings", () => {
  /** A year and a bit of bars rising linearly by `gain` overall. */
  const rising = (symbol: string, gain: number) => ({
    symbol,
    bars: Array.from({ length: 260 }, (_, i) => makeBar({ close: 100 * (1 + (gain * i) / 259) })),
  });

  it("ranks weighted performance into 1–99 percentiles", () => {
    const ratings = rsRatings([rising("A", 0.1), rising("B", 1), rising("C", 0.5)]);
    expect(Object.fromEntries(ratings)).toEqual({ A: 1, C: 50, B: 99 });
  });

  it("leaves symbols without a year of history unrated", () => {
    const ratings = rsRatings([rising("A", 0.1), rising("B", 1), { symbol: "NEW", bars: rising("NEW", 1).bars.slice(-100) }]);
    expect(ratings.has("NEW")).toBe(false);
  });
});

describe("isRsLineAtNewHigh", () => {
  it("is true only when today's value is the highest of the period", () => {
    expect(isRsLineAtNewHigh([1, 2, 3])).toBe(true);
    expect(isRsLineAtNewHigh([1, 3, 2])).toBe(false);
    expect(isRsLineAtNewHigh([5, 1, 2], 2)).toBe(true);
  });

  it("lines up the benchmark by date", () => {
    const day = (d: number, close: number) => makeBar({ date: new Date(2024, 0, d), close });
    expect(rsLine([day(1, 10), day(2, 20)], [day(2, 4)])).toEqual([NaN, 5]);
  });
});
