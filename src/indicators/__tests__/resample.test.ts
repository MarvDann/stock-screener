import { describe, it, expect } from "vitest";
import { resampleBars } from "../resample";
import { makeBar } from "../../__tests__/helpers";

describe("resampleBars", () => {
  it("returns daily bars unchanged", () => {
    const bars = [makeBar(), makeBar()];
    expect(resampleBars(bars, "daily")).toBe(bars);
  });

  it("rolls each Monday-to-Friday week into one bar", () => {
    const bars = [
      // Wed 3 Jan – Fri 5 Jan 2024
      makeBar({ date: new Date("2024-01-03"), open: 10, high: 12, low: 9, close: 11, volume: 100 }),
      makeBar({ date: new Date("2024-01-04"), open: 11, high: 15, low: 10, close: 14, volume: 200 }),
      makeBar({ date: new Date("2024-01-05"), open: 14, high: 14, low: 8, close: 9, volume: 300 }),
      // Mon 8 Jan 2024
      makeBar({ date: new Date("2024-01-08"), open: 9, high: 10, low: 7, close: 8, volume: 50 }),
    ];
    const weekly = resampleBars(bars, "weekly");
    expect(weekly).toHaveLength(2);
    expect(weekly[0]).toEqual({
      date: new Date("2024-01-03"),
      open: 10,
      high: 15,
      low: 8,
      close: 9,
      volume: 600,
    });
    expect(weekly[1]).toEqual(bars[3]);
  });

  it("splits weeks on Monday even across a year boundary", () => {
    const bars = [
      makeBar({ date: new Date("2023-12-29") }), // Fri
      makeBar({ date: new Date("2024-01-01") }), // Mon
      makeBar({ date: new Date("2024-01-02") }), // Tue
    ];
    expect(resampleBars(bars, "weekly").map((b) => b.date)).toEqual([
      new Date("2023-12-29"),
      new Date("2024-01-01"),
    ]);
  });

  it("rolls each calendar month into one bar", () => {
    const bars = [
      makeBar({ date: new Date("2024-01-30"), open: 10, high: 11, low: 9, close: 10, volume: 1 }),
      makeBar({ date: new Date("2024-01-31"), open: 10, high: 13, low: 9, close: 12, volume: 2 }),
      makeBar({ date: new Date("2024-02-01"), open: 12, high: 12, low: 11, close: 11, volume: 4 }),
    ];
    const monthly = resampleBars(bars, "monthly");
    expect(monthly).toHaveLength(2);
    expect(monthly[0]).toMatchObject({ open: 10, high: 13, low: 9, close: 12, volume: 3 });
    expect(monthly[1]).toMatchObject({ open: 12, close: 11, volume: 4 });
  });

  it("does not modify the input bars", () => {
    const bars = [makeBar({ date: new Date("2024-01-02") }), makeBar({ date: new Date("2024-01-03"), close: 50 })];
    resampleBars(bars, "weekly");
    expect(bars[0].close).toBe(102);
  });
});
