import { describe, it, expect } from "vitest";
import { computeGroupStats, computeMarketOverview } from "../marketOverview";
import { makeBar } from "../../__tests__/helpers";
import { SymbolHistory } from "../../types";

/** A history whose last two closes are `prev` then `last`, ending on `lastDay`. */
function history(symbol: string, prev: number, last: number, lastDay = "2026-09-25", leading = 0): SymbolHistory {
  const end = new Date(`${lastDay}T00:00:00Z`);
  const closes = [...Array(leading).fill(prev), prev, last];
  return {
    symbol,
    bars: closes.map((close, i) =>
      makeBar({ date: new Date(end.getTime() - (closes.length - 1 - i) * 864e5), close })
    ),
  };
}

describe("computeMarketOverview", () => {
  it("counts advancers, decliners and unchanged on the latest day", () => {
    const o = computeMarketOverview([
      history("UP1", 100, 103),
      history("UP2", 50, 51),
      history("DOWN", 20, 19),
      history("FLAT", 10, 10),
    ]);
    expect(o.asOf).toBe("2026-09-25");
    expect(o.breadth).toMatchObject({ total: 4, advancers: 2, decliners: 1, unchanged: 1 });
  });

  it("ranks gainers and losers by percent change, with names", () => {
    const o = computeMarketOverview(
      [history("A", 100, 110), history("B", 100, 102), history("C", 100, 95), history("D", 100, 80)],
      { A: "Alpha", D: "Delta" },
      1
    );
    expect(o.gainers).toEqual([{ symbol: "A", name: "Alpha", close: 110, changePct: 10 }]);
    expect(o.losers).toEqual([{ symbol: "D", name: "Delta", close: 80, changePct: -20 }]);
  });

  it("never lists a falling stock as a gainer when few stocks rose", () => {
    const o = computeMarketOverview([history("A", 100, 101), history("B", 100, 99), history("C", 100, 98)]);
    expect(o.gainers.map((m) => m.symbol)).toEqual(["A"]);
    expect(o.losers.map((m) => m.symbol)).toEqual(["C", "B"]);
  });

  it("ignores stocks that didn't trade on the latest day", () => {
    const o = computeMarketOverview([history("TODAY", 100, 101), history("STALE", 100, 150, "2026-09-20")]);
    expect(o.breadth.total).toBe(1);
    expect(o.gainers.map((m) => m.symbol)).toEqual(["TODAY"]);
  });

  it("counts stocks above their 50-day SMA only when there's enough history", () => {
    const o = computeMarketOverview([
      history("ABOVE", 100, 120, "2026-09-25", 60),
      history("BELOW", 100, 80, "2026-09-25", 60),
      history("SHORT", 100, 120),
    ]);
    expect(o.breadth.aboveSma50).toBe(1);
  });

  it("handles no usable data", () => {
    const o = computeMarketOverview([{ symbol: "X", bars: [] }]);
    expect(o).toEqual({
      asOf: null,
      breadth: { total: 0, advancers: 0, decliners: 0, unchanged: 0, aboveSma50: 0 },
      gainers: [],
      losers: [],
    });
  });
});

describe("computeGroupStats", () => {
  it("gives each group its breadth and average move on the latest day", () => {
    const sectors: Record<string, string> = { A: "Tech", B: "Tech", C: "Energy" };
    const { asOf, groups } = computeGroupStats(
      [history("A", 100, 104), history("B", 100, 98), history("C", 100, 101), history("STALE", 100, 90, "2026-09-20")],
      (symbol) => sectors[symbol] ?? null
    );
    expect(asOf).toBe("2026-09-25");
    expect(groups.get("Tech")).toMatchObject({ total: 2, advancers: 1, decliners: 1, avgChangePct: 1 });
    expect(groups.get("Energy")).toMatchObject({ total: 1, advancers: 1, avgChangePct: 1 });
    expect([...groups.keys()].sort()).toEqual(["Energy", "Tech"]);
  });
});
