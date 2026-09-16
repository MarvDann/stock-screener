import { describe, it, expect } from "vitest";
import {
  periodReturnPct,
  relativeStrength,
  moneyFlowScore,
  classifyMoneyFlow,
} from "../relativeStrength";
import { makeBar } from "../../__tests__/helpers";

describe("periodReturnPct", () => {
  it("computes percentage return over N bars", () => {
    const bars = [
      makeBar({ close: 100 }),
      makeBar({ close: 110 }),
      makeBar({ close: 120 }),
    ];
    // 2-bar return: (120 - 100) / 100 * 100 = 20%
    expect(periodReturnPct(bars, 2)).toBeCloseTo(20);
  });

  it("returns NaN when not enough bars", () => {
    const bars = [makeBar({ close: 100 })];
    expect(periodReturnPct(bars, 5)).toBeNaN();
  });

  it("returns NaN when start price is 0", () => {
    const bars = [
      makeBar({ close: 0 }),
      makeBar({ close: 100 }),
    ];
    expect(periodReturnPct(bars, 1)).toBeNaN();
  });
});

describe("relativeStrength", () => {
  it("returns symbol return minus benchmark return", () => {
    const symbol = [makeBar({ close: 100 }), makeBar({ close: 115 })];
    const benchmark = [makeBar({ close: 100 }), makeBar({ close: 110 })];
    // symbol: +15%, benchmark: +10% → RS = 5%
    expect(relativeStrength(symbol, benchmark, 1)).toBeCloseTo(5);
  });

  it("returns NaN when either has insufficient bars", () => {
    const symbol = [makeBar({ close: 100 })];
    const benchmark = [makeBar({ close: 100 }), makeBar({ close: 110 })];
    expect(relativeStrength(symbol, benchmark, 5)).toBeNaN();
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
