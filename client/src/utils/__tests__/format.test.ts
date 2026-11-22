import { describe, it, expect } from "vitest";
import { currencySymbol, formatPercent, formatAbbreviatedCurrency, formatAbbreviatedNumber, formatPrice, formatOrdinal, formatRatio, formatTimeAgo } from "../format";

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

describe("formatAbbreviatedNumber", () => {
  it("shortens thousands, millions and billions", () => {
    expect(formatAbbreviatedNumber(1_234_567)).toBe("1.2M");
    expect(formatAbbreviatedNumber(45_600)).toBe("45.6K");
    expect(formatAbbreviatedNumber(3_100_000_000)).toBe("3.1B");
  });

  it("leaves values under 1,000 unchanged and keeps the sign", () => {
    expect(formatAbbreviatedNumber(950)).toBe("950");
    expect(formatAbbreviatedNumber(-2_500)).toBe("-2.5K");
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

describe("formatOrdinal", () => {
  it("picks st, nd, rd and th, with the teens always th", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 100, 101, 111].map(formatOrdinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "100th", "101st", "111th",
    ]);
  });
});
