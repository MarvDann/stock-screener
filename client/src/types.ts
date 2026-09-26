export interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BreakoutCandidate {
  symbol: string;
  name: string;
  state: "triggered" | "approaching";
  details: {
    close: number;
    sma50: number;
    pctBelowSma50: number;
    rangeContractionPct: number;
    volumeRatio: number;
    daysSinceCross: number | null;
  };
  /** ISO currency prices are in (pence already converted to pounds); null if not known yet. */
  currency: string | null;
}

/** Any tracked ticker; `state`/`details` are null unless it passes the breakout screen. */
export interface StockCard {
  symbol: string;
  name: string;
  state: BreakoutCandidate["state"] | null;
  details: BreakoutCandidate["details"] | null;
  /** ISO currency prices are in (pence already converted to pounds); null if not known yet. */
  currency: string | null;
  bars: DailyBar[];
  sma50Series: number[];
  sma150Series: number[];
}

export interface StocksResponse {
  stocks: StockCard[];
  warnings: string[];
}

/** Breakout scan results; charts are fetched separately, a page at a time. */
export interface BreakoutResponse {
  triggered: BreakoutCandidate[];
  approaching: BreakoutCandidate[];
  warnings: string[];
}

export interface StockFinancials {
  /** Decimal fraction, e.g. 0.4235 for 42.35% */
  grossMargin: number;
  /** Decimal fraction, e.g. 0.301 for 30.10% */
  operatingMargin: number;
  /** Raw amount in `financialCurrency`, e.g. 1200000000 */
  freeCashflow: number;
  /** Ratio, e.g. 0.48 */
  debtToEquity: number;
  trailingPE: number;
  /** ISO currency the company reports in, which can differ from its trading currency. */
  financialCurrency: string | null;
}

/** What a company does and where it is. */
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

export interface StockDetail {
  symbol: string;
  name: string;
  /** ISO currency prices are in (pence already converted to pounds). */
  currency: string | null;
  bars: DailyBar[];
  sma50Series: number[];
  sma150Series: number[];
  details: {
    close: number;
    sma50: number;
    pctBelowSma50: number;
    rangeContractionPct: number;
    volumeRatio: number;
    daysSinceCross: number | null;
  } | null;
  financials: StockFinancials | null;
  /** EPS per quarter, oldest first, for the trailing 4 quarters */
  epsHistory: number[];
  profile: CompanyProfile | null;
  /** Recent headlines about the company, newest first. */
  news: NewsItem[];
}

export interface SectorRotationResult {
  sectorSymbol: string;
  sectorName: string;
  mansfieldRs: number;
  moneyFlowTrend: "accumulation" | "distribution" | "neutral";
  capitalFlow: "accumulating" | "distributing" | "neutral";
  rank: number;
}

export interface SectorRotationResponse {
  results: SectorRotationResult[];
  warnings: string[];
}

export interface Ticker {
  symbol: string;
  name: string;
  /** Null until the server has looked it up; "" when Yahoo has no sector for it. */
  sector: string | null;
  /** Sub-sector. Null until looked up; "" when Yahoo has none. */
  industry: string | null;
}

export interface Etf {
  symbol: string;
  name: string;
  category: string;
}

export interface EtfsResponse {
  /** Display order. */
  categories: string[];
  etfs: Etf[];
}

export interface Mover {
  symbol: string;
  name: string;
  close: number;
  /** Day-over-day change as a percent, e.g. 3.2 for +3.2%. */
  changePct: number;
  currency: string | null;
}

export interface Breadth {
  /** Stocks that traded on the latest day — the ones counted below. */
  total: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  aboveSma50: number;
}

export interface OverviewResponse {
  /** Latest trading day in the data, YYYY-MM-DD. */
  asOf: string | null;
  tracked: number;
  breadth: Breadth;
  gainers: Mover[];
  losers: Mover[];
  breakouts: {
    triggeredCount: number;
    approachingCount: number;
    top: BreakoutCandidate[];
  };
  warnings: string[];
}

export interface GroupStats extends Breadth {
  /** Equal-weighted average day change, as a percent; null if none traded. */
  avgChangePct: number | null;
}

/** Latest-day stats per sector and sub-sector; `sector`/`industry` are "" when a ticker has none. */
export interface SectorStatsResponse {
  asOf: string | null;
  sectors: (GroupStats & { sector: string })[];
  industries: (GroupStats & { sector: string; industry: string })[];
}
