import type { BasePattern } from "../types";

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

/** A number shortened with K/M/B, e.g. 1_234_567 → "1.2M"; values under 1,000 are left as-is. */
export function formatAbbreviatedNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  for (const [threshold, suffix] of ABBREVIATIONS) {
    if (abs >= threshold) {
      return `${sign}${(abs / threshold).toFixed(1)}${suffix}`;
    }
  }

  return `${sign}${abs}`;
}

export function formatAbbreviatedCurrency(value: number, currency = "USD"): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${currencySymbol(currency)}${formatAbbreviatedNumber(Math.abs(value))}`;
}

export function formatRatio(value: number): string {
  return value.toFixed(2);
}

/** How long ago an ISO timestamp was, e.g. "5m ago", "3h ago", "2d ago"; a date after a week. */
export function formatTimeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** An English ordinal, e.g. 1 → "1st", 22 → "22nd", 13 → "13th". */
export function formatOrdinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

const PATTERN_LABELS: Record<BasePattern, string> = {
  "flat-base": "Flat base",
  heartbeat: "Heartbeat",
  "cup-handle": "Cup with handle",
  "low-cheat": "Low cheat",
};

export function formatPattern(pattern: BasePattern): string {
  return PATTERN_LABELS[pattern];
}

/** A VCP's contractions as Minervini writes them, e.g. "3T 24/11/4%". */
export function formatContractions(depths: number[]): string {
  return `${depths.length}T ${depths.map((d) => Math.round(d)).join("/")}%`;
}
