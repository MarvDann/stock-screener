import { describe, it, expect } from "vitest";
import { weinsteinStage } from "../weinsteinStage";
import { makeBar } from "../../__tests__/helpers";
import { DailyBar } from "../../types";

/** One bar per weekday from Mon 1 Jan 2024, closing at each of `closes` in turn (five per week). */
function dailyFromWeeklyCloses(weeklyCloses: number[]): DailyBar[] {
  const bars: DailyBar[] = [];
  const start = Date.UTC(2024, 0, 1);
  weeklyCloses.forEach((close, week) => {
    for (let day = 0; day < 5; day++) {
      const date = new Date(start + (week * 7 + day) * 86_400_000);
      bars.push(makeBar({ date, open: close, high: close + 1, low: close - 1, close }));
    }
  });
  return bars;
}

const range = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i));

describe("weinsteinStage", () => {
  it("needs 35 weeks of history", () => {
    expect(weinsteinStage(dailyFromWeeklyCloses(range(34, (i) => 100 + i)))).toBeNull();
    expect(weinsteinStage(dailyFromWeeklyCloses(range(35, (i) => 100 + i)))).not.toBeNull();
  });

  it("calls a steady advance stage 2", () => {
    const result = weinsteinStage(dailyFromWeeklyCloses(range(60, (i) => 100 + i * 2)))!;
    expect(result.stage).toBe(2);
    expect(result.label).toBe("Advancing");
    expect(result.weeks).toBe(26);
    expect(result.pctFromMa).toBeGreaterThan(0);
    expect(result.maSlopePct).toBeGreaterThan(1);
  });

  it("calls a steady decline stage 4", () => {
    const result = weinsteinStage(dailyFromWeeklyCloses(range(60, (i) => 300 - i * 2)))!;
    expect(result.stage).toBe(4);
    expect(result.label).toBe("Declining");
  });

  it("calls a flat stretch after an advance stage 3", () => {
    const closes = [...range(50, (i) => 100 + i * 2), ...range(40, (i) => 198 + (i % 2 ? 4 : -4))];
    expect(weinsteinStage(dailyFromWeeklyCloses(closes))!.stage).toBe(3);
  });

  it("calls a flat stretch after a decline stage 1", () => {
    const closes = [...range(50, (i) => 300 - i * 2), ...range(40, (i) => 202 + (i % 2 ? 4 : -4))];
    const result = weinsteinStage(dailyFromWeeklyCloses(closes))!;
    expect(result.stage).toBe(1);
    expect(result.label).toBe("Basing");
  });

  it("keeps stage 2 through a pullback below a still-rising average", () => {
    const closes = [...range(60, (i) => 100 + i * 2), 175];
    const result = weinsteinStage(dailyFromWeeklyCloses(closes))!;
    expect(result.pctFromMa).toBeLessThan(0);
    expect(result.stage).toBe(2);
  });

  it("moves from a base into stage 2 once price clears a rising average", () => {
    const closes = [
      ...range(50, (i) => 300 - i * 2),
      ...range(40, (i) => 202 + (i % 2 ? 4 : -4)),
      ...range(15, (i) => 210 + i * 6),
    ];
    expect(weinsteinStage(dailyFromWeeklyCloses(closes))!.stage).toBe(2);
  });
});
