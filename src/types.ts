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
}

/**
 * Result of running the breakout screen against one symbol.
 */
export interface BreakoutScreenResult {
  symbol: string;
  passesTrendTemplate: boolean;
  isConsolidating: boolean;
  isBreakingOut: boolean;
  details: {
    close: number;
    sma50: number;
    sma150: number;
    sma200: number;
    sma200SlopePositive: boolean;
    pctOff52wHigh: number;
    rangeContractionPct: number; // recent range as % of price, lower = tighter
    volumeRatio: number; // today's volume vs avg volume
    pivotHigh: number; // high of the consolidation range being broken
  };
}

/**
 * Result of the sector rotation screen for one sector ETF.
 */
export interface SectorRotationResult {
  sectorSymbol: string;
  sectorName: string;
  relativeStrength1m: number; // sector return - SPY return, 1 month
  relativeStrength3m: number;
  relativeStrength6m: number;
  moneyFlowTrend: "accumulation" | "distribution" | "neutral";
  rank: number; // 1 = strongest rotation-in
}
