import { SymbolHistory } from "./types";

/**
 * Currencies Yahoo quotes in minor units (e.g. London prices in pence as
 * "GBp"), mapped to the major currency and the factor to divide by.
 */
const MINOR_UNITS: Record<string, { major: string; divisor: number }> = {
  GBp: { major: "GBP", divisor: 100 },
  GBX: { major: "GBP", divisor: 100 },
  ZAc: { major: "ZAR", divisor: 100 },
  ILA: { major: "ILS", divisor: 100 },
};

/** The ISO currency prices are shown in once converted, e.g. "GBp" → "GBP". Null stays null (not looked up yet). */
export function displayCurrency(currency: string | null): string | null {
  if (currency === null) return null;
  return MINOR_UNITS[currency]?.major ?? currency;
}

/** Converts a history quoted in minor units (pence etc.) to major units; volumes are unchanged. */
export function toMajorUnits(history: SymbolHistory, currency: string | null): SymbolHistory {
  const unit = currency === null ? undefined : MINOR_UNITS[currency];
  if (!unit) return history;
  const d = unit.divisor;
  return {
    ...history,
    bars: history.bars.map((b) => ({ ...b, open: b.open / d, high: b.high / d, low: b.low / d, close: b.close / d })),
  };
}
