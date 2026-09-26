import YahooFinance from "yahoo-finance2";
import { CompanyProfile, StockFinancials, TickerProfile } from "../types";

const yahooFinance = new YahooFinance();

export interface StockFundamentals {
  financials: StockFinancials | null;
  /** EPS per quarter, oldest first, for the trailing 4 quarters */
  epsHistory: number[];
  profile: CompanyProfile | null;
}

/**
 * Fetches fundamentals (margins, free cash flow, debt/equity, trailing P/E,
 * trailing quarterly EPS, and the company profile) from yahoo-finance2's quoteSummary endpoint.
 * This is independent of the OHLCV MarketDataProvider in use — Yahoo is the
 * only free source for these fundamentals regardless of DATA_PROVIDER.
 */
export async function getStockFundamentals(symbol: string): Promise<StockFundamentals> {
  const result = await yahooFinance.quoteSummary(symbol, {
    modules: ["financialData", "summaryDetail", "earningsHistory", "assetProfile"],
  });

  const fd = result.financialData;
  const sd = result.summaryDetail;

  const financials: StockFinancials | null =
    fd?.grossMargins != null &&
    fd?.operatingMargins != null &&
    fd?.freeCashflow != null &&
    fd?.debtToEquity != null &&
    sd?.trailingPE != null
      ? {
          grossMargin: fd.grossMargins,
          operatingMargin: fd.operatingMargins,
          freeCashflow: fd.freeCashflow,
          // Yahoo reports this as a percent (e.g. 48.2 for a 0.48 ratio).
          debtToEquity: fd.debtToEquity / 100,
          trailingPE: sd.trailingPE,
          financialCurrency: fd.financialCurrency ?? null,
        }
      : null;

  const epsHistory = (result.earningsHistory?.history ?? [])
    .filter((entry): entry is typeof entry & { quarter: Date; epsActual: number } =>
      entry.quarter != null && entry.epsActual != null
    )
    .sort((a, b) => a.quarter.getTime() - b.quarter.getTime())
    .slice(-4)
    .map((entry) => entry.epsActual);

  return { financials, epsHistory, profile: toCompanyProfile(result.assetProfile) };
}

/** The assetProfile fields the overview uses. */
interface AssetProfile {
  longBusinessSummary?: string;
  sector?: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  fullTimeEmployees?: number;
  website?: string;
}

/** Blank strings become null; null when Yahoo has nothing to show at all. */
function toCompanyProfile(ap: AssetProfile | undefined): CompanyProfile | null {
  if (!ap) return null;
  const text = (value: string | undefined) => value?.trim() || null;
  const headquarters = [ap.city, ap.state, ap.country].map(text).filter(Boolean).join(", ") || null;
  const profile: CompanyProfile = {
    summary: text(ap.longBusinessSummary),
    sector: text(ap.sector),
    industry: text(ap.industry),
    headquarters,
    employees: ap.fullTimeEmployees ?? null,
    website: text(ap.website),
  };
  return Object.values(profile).some((v) => v != null) ? profile : null;
}

/** Company display name from Yahoo's quote endpoint, or "" if it has none. */
export async function getQuoteName(symbol: string): Promise<string> {
  const quote = await yahooFinance.quote(symbol);
  return quote?.shortName ?? quote?.longName ?? "";
}

/**
 * Sector and industry from Yahoo's assetProfile module ("" when Yahoo has
 * none, e.g. for ETFs), plus the trading currency from its price module,
 * as Yahoo quotes it: "GBp" means pence.
 */
export async function getTickerProfile(symbol: string): Promise<TickerProfile> {
  const result = await yahooFinance.quoteSummary(symbol, { modules: ["assetProfile", "price"] });
  return {
    sector: result.assetProfile?.sector ?? "",
    industry: result.assetProfile?.industry ?? "",
    currency: result.price?.currency ?? null,
  };
}
