import YahooFinance from "yahoo-finance2";
import { DailyBar, MarketDataProvider, SymbolHistory } from "../types";

const yahooFinance = new YahooFinance();

/**
 * Free, no-API-key data provider backed by yahoo-finance2.
 * Good for experimentation and backtesting. Swap this out for a
 * paid provider (FMP/Polygon) by implementing MarketDataProvider
 * again with the same interface — nothing else in the app needs to change.
 */
export class YahooMarketDataProvider implements MarketDataProvider {
  async getDailyHistory(symbol: string, lookbackDays: number): Promise<SymbolHistory> {
    const period2 = new Date();
    const period1 = new Date();
    period1.setDate(period1.getDate() - lookbackDays);

    const raw = await yahooFinance.chart(symbol, {
      period1,
      period2,
      interval: "1d",
      return: "array",
    });

    const bars: DailyBar[] = (raw.quotes ?? [])
      .filter((q) => q.close != null && q.open != null && q.high != null && q.low != null)
      .map((q) => ({
        date: new Date(q.date),
        open: q.open as number,
        high: q.high as number,
        low: q.low as number,
        close: q.close as number,
        volume: (q.volume as number) ?? 0,
      }));

    return { symbol, bars };
  }

  /**
   * Fetch several symbols with basic concurrency control and a small
   * delay between batches to stay polite to the unofficial endpoint.
   */
  async getManyDailyHistories(
    symbols: string[],
    lookbackDays: number,
    batchSize = 25,
    delayMs = 100
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
