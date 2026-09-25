import { describe, it, expect } from "vitest";
import { ETF_CATEGORIES, getEtf, listEtfs } from "../etfs";
import { SECTOR_ETFS } from "../screens/sectorRotationScreen";
import { SYMBOL_PATTERN } from "../tickers";

describe("etfs", () => {
  it("lists each ETF once with a valid symbol and a known category", () => {
    const symbols = listEtfs().map((e) => e.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    for (const etf of listEtfs()) {
      expect(etf.symbol).toMatch(SYMBOL_PATTERN);
      expect(ETF_CATEGORIES).toContain(etf.category);
      expect(etf.name).not.toBe("");
    }
  });

  it("includes every Sector Rotation ETF under US Sectors", () => {
    for (const symbol of Object.keys(SECTOR_ETFS)) {
      expect(getEtf(symbol)).toMatchObject({ category: "US Sectors", currency: "USD" });
    }
    expect(getEtf("XLK")?.name).toBe("Technology Select Sector SPDR");
  });

  it("orders ETFs by category and keeps London currencies as quoted", () => {
    const order = listEtfs().map((e) => ETF_CATEGORIES.indexOf(e.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(getEtf("SWDA.L")?.currency).toBe("GBp");
    expect(getEtf("VWRP.L")?.currency).toBe("GBP");
    expect(getEtf("SPY")?.currency).toBe("USD");
  });

  it("gives every category at least one ETF", () => {
    for (const category of ETF_CATEGORIES) {
      expect(listEtfs().some((e) => e.category === category)).toBe(true);
    }
  });
});
