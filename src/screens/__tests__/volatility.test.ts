import { describe, it, expect } from "vitest";
import { ratioSeries, summarizeVolatility, vixRegime } from "../volatility";
import { makeBar } from "../../__tests__/helpers";
import { SymbolHistory } from "../../types";

/** A history with one close per day, ending on `lastDay`. */
function history(symbol: string, closes: number[], lastDay = "2026-10-09"): SymbolHistory {
  const end = new Date(`${lastDay}T13:30:00Z`);
  return {
    symbol,
    bars: closes.map((close, i) =>
      makeBar({ date: new Date(end.getTime() - (closes.length - 1 - i) * 864e5), close })
    ),
  };
}

describe("vixRegime", () => {
  it("bands the VIX at 15, 20 and 30", () => {
    expect(vixRegime(12)).toBe("calm");
    expect(vixRegime(15)).toBe("normal");
    expect(vixRegime(19.99)).toBe("normal");
    expect(vixRegime(20)).toBe("elevated");
    expect(vixRegime(30)).toBe("high");
  });
});

describe("ratioSeries", () => {
  it("divides on the dates both series have", () => {
    const a = [{ date: "2026-10-07", value: 15 }, { date: "2026-10-08", value: 18 }, { date: "2026-10-09", value: 20 }];
    const b = [{ date: "2026-10-08", value: 20 }, { date: "2026-10-09", value: 16 }];
    expect(ratioSeries(a, b)).toEqual([
      { date: "2026-10-08", value: 0.9 },
      { date: "2026-10-09", value: 1.25 },
    ]);
  });
});

describe("summarizeVolatility", () => {
  it("reports the latest VIX move, its year range, percentile and regime", () => {
    const s = summarizeVolatility([history("^VIX", [20, 30, 10, 16, 15])]);

    expect(s.asOf).toBe("2026-10-09");
    expect(s.vix).toMatchObject({ close: 15, change: -1, high52w: 30, low52w: 10, regime: "normal" });
    expect(s.vix!.changePct).toBeCloseTo(-6.25);
    // 10 and 15 are at or below 15: 2 of 5.
    expect(s.vix!.percentile1y).toBe(40);
  });

  it("gives the term-structure ratio and lists only the indices that returned data, in display order", () => {
    const s = summarizeVolatility([
      history("^VVIX", [80, 90]),
      history("^VIX3M", [18, 20]),
      history("^VIX", [16, 22]),
      history("^VIX9D", []),
    ]);

    expect(s.termRatio).toBeCloseTo(1.1);
    expect(s.termRatioSeries).toHaveLength(2);
    expect(s.vvix).toMatchObject({ close: 90, change: 10 });
    expect(s.series.map((x) => x.symbol)).toEqual(["^VIX", "^VIX3M", "^VVIX"]);
    expect(s.series[0].points.at(-1)).toEqual({ date: "2026-10-09", value: 22 });
  });

  it("is empty when the VIX itself failed", () => {
    const s = summarizeVolatility([history("^VIX", [])]);
    expect(s).toMatchObject({ asOf: null, vix: null, vvix: null, termRatio: null, series: [] });
  });
});
