import { describe, it, expect } from "vitest";
import { averageVolume, volumeRatio } from "../volatility";
import { makeBar } from "../../__tests__/helpers";

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
