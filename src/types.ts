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

/** A breakout screen result plus enough recent bars to chart it client-side. */
export interface Candidate extends BreakoutScreenResult {
  bars: DailyBar[];
  sma50Series: number[];
  sma150Series: number[];
}

export interface BreakoutScanResponse {
  triggered: Candidate[];
  approaching: Candidate[];
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
}

export interface StockDetailResponse {
  symbol: string;
  name: string;
  bars: DailyBar[];
  sma50Series: number[];
  sma150Series: number[];
  details: BreakoutScreenResult["details"] | null;
  financials: StockFinancials | null;
  /** EPS per quarter, oldest first, for the trailing 4 quarters */
  epsHistory: number[];
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
