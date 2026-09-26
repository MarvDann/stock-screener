import { describe, it, expect } from "vitest";
import { currencySymbol, formatPercent, formatAbbreviatedCurrency, formatPrice, formatRatio, formatTimeAgo } from "../format";

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

describe("currencySymbol", () => {
  it("maps ISO codes to their symbols", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("GBP")).toBe("£");
    expect(currencySymbol("EUR")).toBe("€");
  });

  it("falls back to the code for anything Intl doesn't recognise", () => {
    expect(currencySymbol("not-a-code")).toBe("not-a-code");
  });
});

describe("formatPrice", () => {
  it("prefixes the currency symbol with two decimals", () => {
    expect(formatPrice(190.5, "USD")).toBe("$190.50");
    expect(formatPrice(36.11, "GBP")).toBe("£36.11");
    expect(formatPrice(1234.5, "EUR")).toBe("€1,234.50");
  });

  it("shows just the number when the currency is unknown", () => {
    expect(formatPrice(36.11, null)).toBe("36.11");
    expect(formatPrice(36.11, "not-a-code")).toBe("36.11");
  });
});

describe("formatAbbreviatedCurrency with a currency", () => {
  it("uses that currency's symbol", () => {
    expect(formatAbbreviatedCurrency(1_600_000_000, "EUR")).toBe("€1.6B");
    expect(formatAbbreviatedCurrency(-2_500_000, "GBP")).toBe("-£2.5M");
  });
});

describe("formatTimeAgo", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");

  it("uses minutes, hours, then days", () => {
    expect(formatTimeAgo("2026-09-26T11:55:00Z", now)).toBe("5m ago");
    expect(formatTimeAgo("2026-09-26T09:00:00Z", now)).toBe("3h ago");
    expect(formatTimeAgo("2026-09-24T12:00:00Z", now)).toBe("2d ago");
  });

  it("shows a date once it's a week old", () => {
    expect(formatTimeAgo("2026-09-10T12:00:00Z", now)).toBe("Sep 10");
  });
});
