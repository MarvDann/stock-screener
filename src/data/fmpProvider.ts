import { DailyBar, MarketDataProvider, SymbolHistory } from "../types";

const FMP_BASE_URL = "https://financialmodelingprep.com/stable/historical-price-eod/full";

interface FmpDailyBar {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  vwap: number;
}

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Financial Modeling Prep-backed data provider, using the `stable` API's
 * historical-price-eod/full endpoint. Requires FMP_API_KEY in the
 * environment (see .env / package.json's --env-file wiring).
 *
 * FMP returns this endpoint's array newest-first; it's reversed before
 * mapping so SymbolHistory.bars stays oldest-first, matching every
 * indicator's assumption.
 */
export class FmpMarketDataProvider implements MarketDataProvider {
  private readonly apiKey: string;

  constructor() {
    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
      throw new Error("FMP_API_KEY is not set. Add it to .env before using FmpMarketDataProvider.");
    }
    this.apiKey = apiKey;
  }

  async getDailyHistory(symbol: string, lookbackDays: number): Promise<SymbolHistory> {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - lookbackDays);

    const url = new URL(FMP_BASE_URL);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("from", toDateParam(from));
    url.searchParams.set("to", toDateParam(to));
    url.searchParams.set("apikey", this.apiKey);

    const response = await fetch(url);

    if (!response.ok) {
      let message: string = response.statusText;
      try {
        const errorBody = await response.json();
        message = (errorBody as { "Error Message"?: string })["Error Message"] ?? response.statusText;
      } catch {
        // Non-JSON error body (e.g. HTML from a proxy, empty body on timeout) —
        // fall back to statusText rather than letting a raw SyntaxError escape.
      }
      throw new Error(`FMP request failed for ${symbol}: ${message}`);
    }

    const raw = (await response.json()) as FmpDailyBar[];
    const bars: DailyBar[] = raw
      .filter(
        (bar) =>
          bar.open != null && bar.high != null && bar.low != null && bar.close != null && bar.volume != null
      )
      .slice()
      .reverse()
      .map((bar) => ({
        date: new Date(bar.date),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }));

    return { symbol, bars };
  }

  /**
   * Fetch several symbols with basic concurrency control and a small
   * delay between batches — FMP's per-minute throttle isn't documented
   * for the free tier, so don't assume it's unlimited.
   */
  async getManyDailyHistories(
    symbols: string[],
    lookbackDays: number,
    batchSize = 10,
    delayMs = 300
  ): Promise<SymbolHistory[]> {
    const results: SymbolHistory[] = [];

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((s) =>
          this.getDailyHistory(s, lookbackDays).catch((err) => {
            console.error(`Failed to fetch ${s}:`, err.message);
            return { symbol: s, bars: [] } as SymbolHistory;
          })
        )
      );
      results.push(...batchResults);

      if (i + batchSize < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }
}
