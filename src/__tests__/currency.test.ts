import { describe, it, expect } from "vitest";
import { displayCurrency, toMajorUnits } from "../currency";
import { makeBar } from "./helpers";

describe("currency", () => {
  it("maps minor-unit currencies to their major currency", () => {
    expect(displayCurrency("GBp")).toBe("GBP");
    expect(displayCurrency("ZAc")).toBe("ZAR");
    expect(displayCurrency("USD")).toBe("USD");
    expect(displayCurrency(null)).toBeNull();
  });

  it("converts pence prices to pounds, leaving volume alone", () => {
    const history = { symbol: "SHEL.L", bars: [makeBar({ open: 3600, high: 3650, low: 3590, close: 3611, volume: 5000 })] };
    expect(toMajorUnits(history, "GBp").bars[0]).toMatchObject({ open: 36, high: 36.5, low: 35.9, close: 36.11, volume: 5000 });
  });

  it("returns the history untouched for major currencies and unknown currency", () => {
    const history = { symbol: "AAPL", bars: [makeBar()] };
    expect(toMajorUnits(history, "USD")).toBe(history);
    expect(toMajorUnits(history, null)).toBe(history);
  });
});
