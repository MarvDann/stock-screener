import { describe, it, expect } from "vitest";
import { runSectorRotationScreen } from "../sectorRotationScreen";
import { makeBar } from "../../__tests__/helpers";
import { SymbolHistory } from "../../types";

function makeSectorHistory(symbol: string, returnBias: number): SymbolHistory {
  const bars = Array.from({ length: 200 }, (_, i) =>
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
  it("ranks sectors by 3-month relative strength descending", () => {
    const benchmark = makeSectorHistory("SPY", 0.1);
    const sectors = [
      makeSectorHistory("XLK", 0.3), // strongest
      makeSectorHistory("XLF", 0.05), // weakest
      makeSectorHistory("XLE", 0.2), // middle
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

  it("classifies money flow trend", () => {
    const benchmark = makeSectorHistory("SPY", 0.1);
    const sectors = [makeSectorHistory("XLK", 0.2)];

    const results = runSectorRotationScreen(sectors, benchmark);
    expect(["accumulation", "distribution", "neutral"]).toContain(results[0].moneyFlowTrend);
  });
});
