import type { Breadth, GroupStats, Mover } from "./screens/marketOverview";

/**
 * A single day's OHLCV bar.
 */
export interface DailyBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Full daily price history for one symbol, oldest first.
 */
export interface SymbolHistory {
  symbol: string;
  bars: DailyBar[];
}

/**
 * Data provider abstraction. Swap yahoo-finance2 for FMP/Polygon/etc.
 * later without touching indicator or screen logic.
 */
export interface MarketDataProvider {
  /**
   * Fetch daily OHLCV history for a symbol, oldest bar first.
   * `lookbackDays` is calendar days, not trading days — providers should
   * over-fetch slightly to guarantee enough trading days for a 200-day SMA.
   */
  getDailyHistory(symbol: string, lookbackDays: number): Promise<SymbolHistory>;

  /**
   * Fetch several symbols with basic concurrency control.
   */
  getManyDailyHistories(
    symbols: string[],
    lookbackDays: number,
    batchSize?: number,
    delayMs?: number
  ): Promise<SymbolHistory[]>;
}

/** What the data provider knows about a ticker beyond its price history. */
export interface TickerProfile {
  sector: string;
  industry: string;
  /** Trading currency as quoted, e.g. "USD" or "GBp" (pence). */
  currency: string | null;
}

/**
 * Result of running the breakout screen against one symbol.
 */
export interface BreakoutScreenResult {
  symbol: string;
  name: string;
  state: "triggered" | "approaching";
  details: {
    close: number;
    sma50: number;
    /** (sma50 - close) / sma50 * 100. Negative once price is above the SMA. */
    pctBelowSma50: number;
    rangeContractionPct: number; // recent range as % of price, lower = tighter
    volumeRatio: number; // today's volume vs its average
    /** Trading days since the MA50 cross (0 = today). Null when state is "approaching". */
    daysSinceCross: number | null;
  };
}

/**
 * A breakout screen result as the API returns it. Charts aren't included —
 * clients fetch those a page at a time from /api/stocks.
 */
export interface BreakoutScanResult extends BreakoutScreenResult {
  /** ISO currency prices are in, after converting minor units (pence → pounds). Null if not looked up yet. */
  currency: string | null;
}

/**
 * Any tracked ticker, chartable client-side. `state` and `details` are
 * null unless the stock currently qualifies for the breakout screen.
 */
export interface StockCard {
  symbol: string;
  name: string;
  state: BreakoutScreenResult["state"] | null;
  details: BreakoutScreenResult["details"] | null;
  /** ISO currency prices are in, after converting minor units (pence → pounds). Null if not looked up yet. */
  currency: string | null;
  bars: DailyBar[];
  sma50Series: number[];
  sma150Series: number[];
}

export interface StocksResponse {
  stocks: StockCard[];
  warnings: string[];
}

export interface BreakoutScanResponse {
  triggered: BreakoutScanResult[];
  approaching: BreakoutScanResult[];
  warnings: string[];
}

/**
 * Fundamental ratios for a symbol, sourced from yahoo-finance2's
 * financialData and summaryDetail quoteSummary modules.
 */
export interface StockFinancials {
  /** Decimal fraction, e.g. 0.4235 for 42.35% */
  grossMargin: number;
  /** Decimal fraction, e.g. 0.301 for 30.10% */
  operatingMargin: number;
  /** Raw dollar amount, e.g. 1200000000 */
  freeCashflow: number;
  /** Ratio, e.g. 0.48 */
  debtToEquity: number;
  trailingPE: number;
  /** ISO currency the company reports in (may differ from its trading currency), e.g. "USD". */
  financialCurrency: string | null;
}

export interface StockDetailResponse {
  symbol: string;
  name: string;
  /** ISO currency prices are in, after converting minor units (pence → pounds). */
  currency: string | null;
  bars: DailyBar[];
  sma50Series: number[];
  sma150Series: number[];
  details: BreakoutScreenResult["details"] | null;
  financials: StockFinancials | null;
  /** EPS per quarter, oldest first, for the trailing 4 quarters */
  epsHistory: number[];
}

/** Everything the home page shows about the tracked universe, from one scan. */
export interface OverviewResponse {
  asOf: string | null;
  /** Tracked tickers, including any that failed to fetch. */
  tracked: number;
  breadth: Breadth;
  gainers: (Mover & { currency: string | null })[];
  losers: (Mover & { currency: string | null })[];
  breakouts: {
    triggeredCount: number;
    approachingCount: number;
    /** Strongest triggered setups first (by volume ratio). */
    top: BreakoutScanResult[];
  };
  warnings: string[];
}

/**
 * Latest-day stats per sector and sub-sector of the tracked tickers.
 * `sector`/`industry` are "" for tickers without one.
 */
export interface SectorStatsResponse {
  asOf: string | null;
  sectors: (GroupStats & { sector: string })[];
  industries: (GroupStats & { sector: string; industry: string })[];
}

export interface SectorRotationScanResponse {
  results: SectorRotationResult[];
  warnings: string[];
}

/**
 * Result of the sector rotation screen for one sector ETF.
 */
export interface SectorRotationResult {
  sectorSymbol: string;
  sectorName: string;
  mansfieldRs: number;
  moneyFlowTrend: "accumulation" | "distribution" | "neutral";
  capitalFlow: "accumulating" | "distributing" | "neutral";
  rank: number; // 1 = strongest rotation-in
}
