const ABBREVIATIONS: [number, string][] = [
  [1_000_000_000, "B"],
  [1_000_000, "M"],
  [1_000, "K"],
];

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatAbbreviatedCurrency(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  for (const [threshold, suffix] of ABBREVIATIONS) {
    if (abs >= threshold) {
      return `${sign}$${(abs / threshold).toFixed(1)}${suffix}`;
    }
  }

  return `${sign}$${abs}`;
}

export function formatRatio(value: number): string {
  return value.toFixed(2);
}
