import { describe, it, expect } from "vitest";
import { formatPercent, formatAbbreviatedCurrency, formatRatio } from "../format";

describe("formatPercent", () => {
  it("converts a decimal fraction to a percentage string with 2 decimal places", () => {
    expect(formatPercent(0.4235)).toBe("42.35%");
  });

  it("pads whole-number percentages to 2 decimal places", () => {
    expect(formatPercent(0.5)).toBe("50.00%");
  });

  it("formats zero as 0.00%", () => {
    expect(formatPercent(0)).toBe("0.00%");
  });

  it("preserves the sign for a negative margin", () => {
    expect(formatPercent(-0.1234)).toBe("-12.34%");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatPercent(0.30101)).toBe("30.10%");
  });
});

describe("formatAbbreviatedCurrency", () => {
  it("abbreviates billions with one decimal place", () => {
    expect(formatAbbreviatedCurrency(1_200_000_000)).toBe("$1.2B");
  });

  it("abbreviates millions with one decimal place", () => {
    expect(formatAbbreviatedCurrency(1_500_000)).toBe("$1.5M");
  });

  it("abbreviates thousands with one decimal place", () => {
    expect(formatAbbreviatedCurrency(2_500)).toBe("$2.5K");
  });

  it("shows whole dollars with no suffix below 1,000", () => {
    expect(formatAbbreviatedCurrency(500)).toBe("$500");
  });

  it("formats zero as $0", () => {
    expect(formatAbbreviatedCurrency(0)).toBe("$0");
  });

  it("prefixes a minus sign for negative free cash flow", () => {
    expect(formatAbbreviatedCurrency(-1_200_000_000)).toBe("-$1.2B");
  });

  it("uses the largest applicable unit", () => {
    expect(formatAbbreviatedCurrency(2_340_000_000)).toBe("$2.3B");
    expect(formatAbbreviatedCurrency(999)).toBe("$999");
  });
});

describe("formatRatio", () => {
  it("formats a ratio to 2 decimal places", () => {
    expect(formatRatio(0.483)).toBe("0.48");
  });

  it("formats zero as 0.00", () => {
    expect(formatRatio(0)).toBe("0.00");
  });

  it("formats a ratio greater than 1", () => {
    expect(formatRatio(1.2)).toBe("1.20");
  });

  it("preserves the sign for a negative ratio", () => {
    expect(formatRatio(-0.25)).toBe("-0.25");
  });
});
