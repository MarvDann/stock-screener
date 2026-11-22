import type { Breadth, GroupStats, Mover } from "./screens/marketOverview";
import type { VolatilitySummary } from "./screens/volatility";
import type { IndustryGroup, IndustryGroupMember } from "./screens/industryGroups";

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

/** The kind of base a breakout comes out of. */
export type BasePattern = "flat-base" | "heartbeat" | "cup-handle" | "low-cheat";

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
    pattern: BasePattern;
    /** High of the base's final contraction — the buy point. */
    pivot: number;
    /** (close - pivot) / pivot * 100. Negative while below the pivot. */
    pctFromPivot: number;
    /** Left-side high to the base's low, in %. */
    baseDepthPct: number;
    baseLengthWeeks: number;
    /** Depth of each contraction in %, oldest first — e.g. [24, 11, 4] for a 3T VCP. */
    contractions: number[];
    /** Volume vs its 50-day average, on the breakout day once triggered, else today. */
    volumeRatio: number;
    /** Breakout-day volume at least 40% above average. Always false while approaching. */
    volumeConfirmed: boolean;
    /** More than 5% above the pivot — past the buy range. */
    extended: boolean;
    /** Trading days since the close crossed the pivot (0 = today). Null when approaching. */
    daysSinceBreakout: number | null;
    /** RS Rating (1–99) against the tracked universe; null when it couldn't be ranked. */
    rsRating: number | null;
    /** RS line vs SPY at a 52-week high; null without benchmark data. */
    rsLineNewHigh: boolean | null;
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

/** What a company does and where it is, from Yahoo's assetProfile module. */
export interface CompanyProfile {
  summary: string | null;
  sector: string | null;
  industry: string | null;
  /** e.g. "Cupertino, CA, United States" */
  headquarters: string | null;
  employees: number | null;
  website: string | null;
}

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  /** ISO timestamp */
  publishedAt: string;
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
  profile: CompanyProfile | null;
  /** Recent headlines about the company, newest first. */
  news: NewsItem[];
}

/** A stock's weekly or monthly price chart, for the detail page. */
export interface StockChartResponse {
  timeframe: "weekly" | "monthly";
  /** One bar per week or month, dated by its first trading day; the last covers the period so far. */
  bars: DailyBar[];
  /** Lengths, in bars, of the fast and slow SMAs. */
  smaPeriods: [number, number];
  smaFastSeries: number[];
  smaSlowSeries: number[];
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

/** When a report lands relative to its exchange's regular trading hours. */
export type EarningsSession = "before-open" | "during-market" | "after-close";

/** A tracked company's upcoming earnings report. */
export interface EarningsEvent {
  symbol: string;
  name: string;
  /** "" when the data provider has none; null until looked up. */
  sector: string | null;
  /** ISO timestamp. Yahoo often gives a session placeholder (8:30am or 4pm ET) rather than the exact time. */
  date: string;
  session: EarningsSession;
  /** Yahoo's projection rather than a date the company has announced. */
  estimated: boolean;
}

export interface EarningsResponse {
  /** Today and the next 7 days, soonest first. */
  earnings: EarningsEvent[];
  warnings: string[];
}

/** The VIX family of indices, for the volatility page. */
export interface VolatilityResponse extends VolatilitySummary {
  warnings: string[];
}

/** The strongest industry groups, each with its leader and top competitors. */
export interface IndustryGroupsResponse {
  asOf: string | null;
  /** Groups with enough rated stocks to be ranked; `groups` is the top few of these. */
  rankedGroups: number;
  groups: (Omit<IndustryGroup, "members"> & {
    members: (IndustryGroupMember & { currency: string | null })[];
  })[];
  warnings: string[];
}
