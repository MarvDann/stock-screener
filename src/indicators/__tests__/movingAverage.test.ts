import { describe, it, expect } from "vitest";
import { sma, highestHigh, lowestLow } from "../movingAverage";
import { makeBar } from "../../__tests__/helpers";

describe("sma", () => {
  it("computes the average closing price over the period", () => {
    const bars = [
      makeBar({ close: 10 }),
      makeBar({ close: 20 }),
      makeBar({ close: 30 }),
    ];
    expect(sma(bars, 3)).toBe(20);
  });

  it("uses only the last N bars when period < bars.length", () => {
    const bars = [
      makeBar({ close: 100 }),
      makeBar({ close: 10 }),
      makeBar({ close: 20 }),
      makeBar({ close: 30 }),
    ];
    expect(sma(bars, 3)).toBe(20);
  });

  it("returns NaN when not enough bars", () => {
    const bars = [makeBar({ close: 10 })];
    expect(sma(bars, 5)).toBeNaN();
  });

  it("respects endIndex", () => {
    const bars = [
      makeBar({ close: 10 }),
      makeBar({ close: 20 }),
      makeBar({ close: 30 }),
      makeBar({ close: 40 }),
    ];
    expect(sma(bars, 2, 1)).toBe(15);
  });
});

describe("highestHigh", () => {
  it("finds the max high in the window", () => {
    const bars = [
      makeBar({ high: 50 }),
      makeBar({ high: 80 }),
      makeBar({ high: 60 }),
    ];
    expect(highestHigh(bars, 3)).toBe(80);
  });

  it("respects period and endIndex", () => {
    const bars = [
      makeBar({ high: 200 }),
      makeBar({ high: 50 }),
      makeBar({ high: 80 }),
      makeBar({ high: 60 }),
    ];
    expect(highestHigh(bars, 2, 2)).toBe(80);
  });
});

describe("lowestLow", () => {
  it("finds the min low in the window", () => {
    const bars = [
      makeBar({ low: 50 }),
      makeBar({ low: 30 }),
      makeBar({ low: 60 }),
    ];
    expect(lowestLow(bars, 3)).toBe(30);
  });

  it("respects period and endIndex", () => {
    const bars = [
      makeBar({ low: 5 }),
      makeBar({ low: 50 }),
      makeBar({ low: 30 }),
      makeBar({ low: 60 }),
    ];
    expect(lowestLow(bars, 2, 2)).toBe(30);
  });
});
