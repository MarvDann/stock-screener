import { describe, it, expect } from "vitest";
import { runSectorRotationScreen } from "../sectorRotationScreen";
import { makeBar } from "../../__tests__/helpers";
import { SymbolHistory } from "../../types";

function makeSectorHistory(symbol: string, returnBias: number): SymbolHistory {
  const bars = Array.from({ length: 250 }, (_, i) =>
    makeBar({
      date: new Date(2024, 0, 2 + i),
      close: 100 + i * returnBias,
      open: 100 + i * returnBias - 0.5,
      high: 100 + i * returnBias + 2,
      low: 100 + i * returnBias - 2,
      volume: 1_000_000,
    })
  );
  return { symbol, bars };
}

describe("runSectorRotationScreen", () => {
  it("ranks sectors by Mansfield RS descending", () => {
    const benchmark = makeSectorHistory("SPY", 0.1);
    const sectors = [
      makeSectorHistory("XLK", 0.3),
      makeSectorHistory("XLF", 0.05),
      makeSectorHistory("XLE", 0.2),
    ];

    const results = runSectorRotationScreen(sectors, benchmark);

    expect(results).toHaveLength(3);
    expect(results[0].rank).toBe(1);
    expect(results[0].sectorSymbol).toBe("XLK");
    expect(results[1].sectorSymbol).toBe("XLE");
    expect(results[2].sectorSymbol).toBe("XLF");
  });

  it("assigns rank 1 through N", () => {
    const benchmark = makeSectorHistory("SPY", 0.1);
    const sectors = [
      makeSectorHistory("XLK", 0.2),
      makeSectorHistory("XLF", 0.15),
    ];

    const results = runSectorRotationScreen(sectors, benchmark);
    const ranks = results.map((r) => r.rank);
    expect(ranks).toEqual([1, 2]);
  });

  it("includes sector name from SECTOR_ETFS map", () => {
    const benchmark = makeSectorHistory("SPY", 0.1);
    const sectors = [makeSectorHistory("XLK", 0.2)];

    const results = runSectorRotationScreen(sectors, benchmark);
    expect(results[0].sectorName).toBe("Technology");
  });

  it("includes mansfieldRs, moneyFlowTrend, and capitalFlow", () => {
    const benchmark = makeSectorHistory("SPY", 0.1);
    const sectors = [makeSectorHistory("XLK", 0.2)];

    const results = runSectorRotationScreen(sectors, benchmark);
    expect(typeof results[0].mansfieldRs).toBe("number");
    expect(["accumulation", "distribution", "neutral"]).toContain(results[0].moneyFlowTrend);
    expect(["accumulating", "distributing", "neutral"]).toContain(results[0].capitalFlow);
  });
});
