import { describe, it, expect } from "vitest";
import { rangeContractionPct, isVolatilityContracting, averageVolume, volumeRatio } from "../volatility";
import { makeBar } from "../../__tests__/helpers";

describe("rangeContractionPct", () => {
  it("computes (highest high - lowest low) / lowest low * 100", () => {
    const bars = [
      makeBar({ high: 110, low: 100 }),
      makeBar({ high: 115, low: 95 }),
      makeBar({ high: 108, low: 98 }),
    ];
    // highest high = 115, lowest low = 95 → (115 - 95) / 95 * 100
    expect(rangeContractionPct(bars, 3)).toBeCloseTo((20 / 95) * 100, 5);
  });

  it("returns NaN when lowest low is 0", () => {
    const bars = [makeBar({ high: 10, low: 0 })];
    expect(rangeContractionPct(bars, 1)).toBeNaN();
  });
});

describe("isVolatilityContracting", () => {
  it("returns true when recent range is tighter than prior", () => {
    // Prior period: wide range
    const wideBars = Array.from({ length: 40 }, () => makeBar({ high: 120, low: 80 }));
    // Recent period: tight range
    const tightBars = Array.from({ length: 15 }, () => makeBar({ high: 102, low: 98 }));
    const bars = [...wideBars, ...tightBars];

    expect(isVolatilityContracting(bars, 15, 40)).toBe(true);
  });

  it("returns false when recent range is wider than prior", () => {
    const tightBars = Array.from({ length: 40 }, () => makeBar({ high: 102, low: 98 }));
    const wideBars = Array.from({ length: 15 }, () => makeBar({ high: 120, low: 80 }));
    const bars = [...tightBars, ...wideBars];

    expect(isVolatilityContracting(bars, 15, 40)).toBe(false);
  });
});

describe("averageVolume", () => {
  it("computes the mean volume over the period", () => {
    const bars = [
      makeBar({ volume: 100 }),
      makeBar({ volume: 200 }),
      makeBar({ volume: 300 }),
    ];
    expect(averageVolume(bars, 3)).toBe(200);
  });
});

describe("volumeRatio", () => {
  it("computes today's volume / average of prior bars", () => {
    const bars = [
      makeBar({ volume: 100 }),
      makeBar({ volume: 100 }),
      makeBar({ volume: 100 }),
      makeBar({ volume: 300 }), // today: 3x the average
    ];
    expect(volumeRatio(bars, 3)).toBeCloseTo(3.0);
  });

  it("returns NaN when average volume is 0", () => {
    const bars = [
      makeBar({ volume: 0 }),
      makeBar({ volume: 0 }),
      makeBar({ volume: 500 }),
    ];
    expect(volumeRatio(bars, 2)).toBeNaN();
  });
});
