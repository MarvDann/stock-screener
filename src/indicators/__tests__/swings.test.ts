import { describe, it, expect } from "vitest";
import { findContractions, zigzag } from "../swings";
import { makeBar } from "../../__tests__/helpers";

/** One bar per price, with high = low = close. */
const barsAt = (prices: number[]) => prices.map((p, i) => makeBar({ date: new Date(2024, 0, 1 + i), close: p, high: p, low: p }));

describe("zigzag", () => {
  it("confirms swings only on a reversal of at least the threshold", () => {
    const bars = barsAt([100, 98, 96, 97, 95, 99, 100, 99]);
    // 96→97 is ~1% (ignored); 95→99 is ~4% (a swing low at 95); the final 100 is the unconfirmed high.
    expect(zigzag(bars, 0, bars.length - 1, 3).map((s) => [s.type, s.price])).toEqual([
      ["high", 100],
      ["low", 95],
      ["high", 100],
    ]);
  });
});

describe("findContractions", () => {
  it("measures each pullback and runs the last one to the end", () => {
    const bars = barsAt([100, 80, 95, 88, 94, 92, 93]);
    expect(findContractions(bars, 0, bars.length - 1, 3).map((c) => Math.round(c.depthPct))).toEqual([20, 7, 2]);
  });

  it("merges a pullback that undercuts an earlier low into that contraction", () => {
    const bars = barsAt([100, 90, 96, 85, 95]);
    const contractions = findContractions(bars, 0, bars.length - 1, 3);
    expect(contractions.map((c) => [c.high, c.low])).toEqual([
      [100, 85],
      [95, 95],
    ]);
  });
});
