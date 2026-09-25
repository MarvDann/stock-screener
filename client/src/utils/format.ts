const ABBREVIATIONS: [number, string][] = [
  [1_000_000_000, "B"],
  [1_000_000, "M"],
  [1_000, "K"],
];

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

/** The symbol for an ISO currency code, e.g. "GBP" → "£"; falls back to the code itself. */
export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/** A price with its currency symbol, e.g. "£36.11"; just the number when the currency isn't known. */
export function formatPrice(value: number, currency: string | null): string {
  if (!currency) return value.toFixed(2);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

export function formatAbbreviatedCurrency(value: number, currency = "USD"): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const symbol = currencySymbol(currency);

  for (const [threshold, suffix] of ABBREVIATIONS) {
    if (abs >= threshold) {
      return `${sign}${symbol}${(abs / threshold).toFixed(1)}${suffix}`;
    }
  }

  return `${sign}${symbol}${abs}`;
}

export function formatRatio(value: number): string {
  return value.toFixed(2);
}
