export interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** The kind of base a breakout comes out of. */
export type BasePattern = "flat-base" | "heartbeat" | "cup-handle" | "low-cheat";

export interface BreakoutDetails {
  close: number;
  sma50: number;
  pattern: BasePattern;
  /** High of the base's final contraction — the buy point. */
  pivot: number;
  /** % from the pivot; negative while below it. */
  pctFromPivot: number;
  baseDepthPct: number;
  baseLengthWeeks: number;
  /** Depth of each contraction in %, oldest first. */
  contractions: number[];
  /** Volume vs its 50-day average, on the breakout day once triggered, else today. */
  volumeRatio: number;
  /** Breakout-day volume at least 40% above average. */
  volumeConfirmed: boolean;
  /** More than 5% above the pivot — past the buy range. */
  extended: boolean;
  /** Trading days since crossing the pivot (0 = today); null while approaching. */
  daysSinceBreakout: number | null;
  /** RS Rating (1–99) against the tracked universe; null when it couldn't be ranked. */
  rsRating: number | null;
  /** RS line vs SPY at a 52-week high; null without benchmark data. */
  rsLineNewHigh: boolean | null;
}

export interface BreakoutCandidate {
  symbol: string;
  name: string;
  state: "triggered" | "approaching";
  details: BreakoutDetails;
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

/** Stan Weinstein's stage, read from the weekly chart against the 30-week SMA. */
export interface WeinsteinStage {
  stage: 1 | 2 | 3 | 4;
  label: "Basing" | "Advancing" | "Topping" | "Declining";
  /** Consecutive weeks in this stage (at least this many: history is ~2 years). */
  weeks: number;
  ma30: number;
  /** % change in the 30-week SMA over the last 5 weeks. */
  maSlopePct: number;
  /** % the latest weekly close sits above (or below) the 30-week SMA. */
  pctFromMa: number;
}

export interface StockDetail {
  symbol: string;
  name: string;
  /** ISO currency prices are in (pence already converted to pounds). */
  currency: string | null;
  bars: DailyBar[];
  sma50Series: number[];
  sma150Series: number[];
  sma200Series: number[];
  details: BreakoutDetails | null;
  /** Null without ~35 weeks of history. */
  stage: WeinsteinStage | null;
  financials: StockFinancials | null;
  /** EPS per quarter, oldest first, for the trailing 4 quarters */
  epsHistory: number[];
  profile: CompanyProfile | null;
  /** Recent headlines about the company, newest first. */
  news: NewsItem[];
}

export type ChartTimeframe = "daily" | "weekly" | "monthly";

/** A stock's weekly or monthly price chart, for the detail page. */
export interface StockChart {
  timeframe: Exclude<ChartTimeframe, "daily">;
  /** One bar per week or month, dated by its first trading day; the last covers the period so far. */
  bars: DailyBar[];
  /** Lengths, in bars, of the fast and slow SMAs. */
  smaPeriods: [number, number];
  smaFastSeries: number[];
  smaSlowSeries: number[];
  /** A third, longer SMA (40 bars); null on charts without one. */
  smaLong: { period: number; series: number[] } | null;
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
  /** An industry group of the user's own (e.g. "Cybersecurity"), ranked instead of `industry`. Null when unset. */
  customGroup: string | null;
}

export interface Watchlist {
  id: number;
  name: string;
  /** In the order they were added. */
  symbols: string[];
}

export interface Etf {
  symbol: string;
  name: string;
  category: string;
}

export interface EtfsResponse {
  /** Display order. */
  categories: string[];
  /** Categories ETFs can be added to or moved between; US Sectors is fixed. */
  editableCategories: string[];
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
  /** Stocks with enough history for a 200-day SMA — the denominator for aboveSma200. */
  withSma200: number;
  aboveSma200: number;
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

/** When a report lands relative to its exchange's regular trading hours. */
export type EarningsSession = "before-open" | "during-market" | "after-close";

/** A tracked company's upcoming earnings report. */
export interface EarningsEvent {
  symbol: string;
  name: string;
  /** "" when Yahoo has none; null until looked up. */
  sector: string | null;
  /** ISO timestamp. Often a session placeholder (8:30am or 4pm ET) rather than the exact time. */
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

export type VolatilityRegime = "calm" | "normal" | "elevated" | "high";

export interface DatedValue {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

export interface LatestMove {
  close: number;
  /** Point change from the previous close; null with only one bar. */
  change: number | null;
  changePct: number | null;
}

/** The VIX family of indices: latest readings plus a year of daily closes. */
export interface VolatilityResponse {
  /** Latest VIX session, YYYY-MM-DD. */
  asOf: string | null;
  vix: (LatestMove & { high52w: number; low52w: number; percentile1y: number; regime: VolatilityRegime }) | null;
  vvix: LatestMove | null;
  /** VIX ÷ VIX 3-month on the latest day both have. Above 1 the curve is inverted (backwardation). */
  termRatio: number | null;
  /** Daily closes per index, oldest first, keyed by Yahoo symbol (^VIX, ^VIX9D, ^VIX3M, ^VVIX). */
  series: { symbol: string; name: string; points: DatedValue[] }[];
  /** VIX ÷ VIX 3-month for each day both have, oldest first. */
  termRatioSeries: DatedValue[];
  warnings: string[];
}

export interface IndustryGroupMember {
  symbol: string;
  name: string;
  close: number;
  /** ISO currency prices are in (pence already converted to pounds); null if not known yet. */
  currency: string | null;
  /** 1-month performance as a percentile (1–99) of the tracked universe's; null without the history. */
  rs1m: number | null;
  /** 3-month performance as a percentile (1–99) of the tracked universe's; null without the history. */
  rs3m: number | null;
  /** % change over 1 and 3 months; null without enough history. */
  perf1m: number | null;
  perf3m: number | null;
  /** % below the 52-week high (0 at the high, negative below). */
  pctFromHigh: number;
  aboveSma50: boolean;
  /** Passes the Trend Template — a Stage 2 uptrend. */
  stage2: boolean;
  /** The breakout screen's verdict, or null when it isn't setting up. */
  setup: "triggered" | "approaching" | null;
}

export interface IndustryGroup {
  /** 1 = strongest ranked group. */
  rank: number;
  industry: string;
  /** The sector most of the group's stocks are in. */
  sector: string;
  /** A group made on the Tickers page rather than one of Yahoo's industries. */
  custom: boolean;
  memberCount: number;
  /** Mean of the members' 1-month and 3-month RS — what groups are ranked by. */
  rsScore: number;
  avgRs1m: number;
  avgRs3m: number;
  perf1m: number | null;
  perf3m: number | null;
  aboveSma50: number;
  stage2: number;
  /** Strongest first — the first is the group leader. */
  members: IndustryGroupMember[];
}

export interface IndustryGroupsResponse {
  asOf: string | null;
  /** Groups with enough stocks to be ranked. */
  rankedGroups: number;
  groups: IndustryGroup[];
  warnings: string[];
}
