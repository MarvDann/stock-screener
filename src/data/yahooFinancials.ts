import YahooFinance from "yahoo-finance2";
import { StockFinancials } from "../types";

const yahooFinance = new YahooFinance();

export interface StockFundamentals {
  financials: StockFinancials | null;
  /** EPS per quarter, oldest first, for the trailing 4 quarters */
  epsHistory: number[];
}

/**
 * Fetches fundamentals (margins, free cash flow, debt/equity, trailing P/E,
 * and trailing quarterly EPS) from yahoo-finance2's quoteSummary endpoint.
 * This is independent of the OHLCV MarketDataProvider in use — Yahoo is the
 * only free source for these fundamentals regardless of DATA_PROVIDER.
 */
export async function getStockFundamentals(symbol: string): Promise<StockFundamentals> {
  const result = await yahooFinance.quoteSummary(symbol, {
    modules: ["financialData", "summaryDetail", "earningsHistory"],
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
        }
      : null;

  const epsHistory = (result.earningsHistory?.history ?? [])
    .filter((entry): entry is typeof entry & { quarter: Date; epsActual: number } =>
      entry.quarter != null && entry.epsActual != null
    )
    .sort((a, b) => a.quarter.getTime() - b.quarter.getTime())
    .slice(-4)
    .map((entry) => entry.epsActual);

  return { financials, epsHistory };
}
