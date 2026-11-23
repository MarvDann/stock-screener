import express, { type Request } from "express";
import { YahooMarketDataProvider } from "./data/yahooProvider";
import { getQuoteName, getStockFundamentals, getTickerProfile } from "./data/yahooFinancials";
import { getCompanyNews } from "./data/companyNews";
import { NextEarnings, fetchNextEarnings, marketSession, upcomingEarnings } from "./data/earningsCalendar";
import { BreakoutContext, runBreakoutScreen, scanBreakoutScreen, DEFAULT_BREAKOUT_CONFIG } from "./screens/breakoutScreen";
import { runSectorRotationScreen, SECTOR_ETFS } from "./screens/sectorRotationScreen";
import { BENCHMARK_SYMBOL } from "./universe";
import { sma } from "./indicators/movingAverage";
import { resampleBars, Timeframe } from "./indicators/resample";
import { rsRatings } from "./indicators/relativeStrength";
import {
  BreakoutScanResponse,
  EarningsResponse,
  IndustryGroupsResponse,
  MarketDataProvider,
  OverviewResponse,
  SectorStatsResponse,
  SectorRotationScanResponse,
  StockCard,
  StockDetailResponse,
  StockChartResponse,
  StocksResponse,
  SymbolHistory,
  VolatilityResponse,
} from "./types";
import { toNodeHandler } from "better-auth/node";
import { auth, authProvidersRouter } from "./auth";
import { migrate } from "./migrate";
import { requireAuth } from "./middleware/requireAuth";
import { clearCache, getCached, setCache } from "./cache";
import {
  backfillProfiles,
  createTickersRouter,
  loadTickers,
  getCurrencyMap,
  getNameMap,
  getTickerCurrency,
  getTickerName,
  listSymbols,
  listTickers,
  normalizeSymbol,
} from "./tickers";
import { displayCurrency, toMajorUnits } from "./currency";
import { createEtfsRouter, getEtf, listEtfs, loadEtfs } from "./etfs";
import { createWatchlistsRouter } from "./watchlists";
import { computeGroupStats, computeMarketOverview } from "./screens/marketOverview";
import { VOLATILITY_INDICES, summarizeVolatility } from "./screens/volatility";
import { rankIndustryGroups } from "./screens/industryGroups";

const app = express();
// Better Auth reads its own request bodies, so it's mounted before express.json().
app.all("/api/auth/{*path}", toNodeHandler(auth));
app.use(express.json());
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
// Production binds to localhost only (HOST=127.0.0.1): nginx is the way in.
const HOST = process.env.HOST;
// ~375 trading days: a year for the 52-week checks and RS Rating, plus room for 65-week bases.
const LOOKBACK_CALENDAR_DAYS = 550;
const CHART_BARS = 120;
const DETAIL_CHART_BARS = 252;
/**
 * The detail chart's own history: its 252 bars plus 199 before them to warm up
 * the 200-day SMA, ~451 trading days, so the line runs the chart's full width.
 */
const DETAIL_LOOKBACK_DAYS = 700;
/**
 * The detail page's longer-term charts: weekly shows ~3 years, monthly ~10,
 * each fetched with enough extra history to warm up its longest SMA. Both use
 * 10, 30 and 40-bar SMAs; on the weekly those are the daily's 50, 150 and 200-day.
 */
const LONG_TERM_CHARTS: Record<Exclude<Timeframe, "daily">, { lookbackDays: number; visibleBars: number }> = {
  weekly: { lookbackDays: 5 * 365, visibleBars: 156 },
  monthly: { lookbackDays: 15 * 365, visibleBars: 120 },
};
const LONG_TERM_SMA_PERIODS: [number, number] = [10, 30];
/** Both charts' third, longer line: 40 bars (on the weekly, the daily's 200-day). */
const LONG_TERM_LONG_SMA_PERIOD = 40;
const MAX_STOCKS_PER_REQUEST = 24;

const provider: MarketDataProvider = new YahooMarketDataProvider();

/** The history's last `days` calendar days, counted back from its latest bar. */
function trimToCalendarDays(history: SymbolHistory, days: number): SymbolHistory {
  const last = history.bars.at(-1);
  if (!last) return history;
  const cutoff = new Date(last.date).getTime() - days * 24 * 60 * 60 * 1000;
  return { ...history, bars: history.bars.filter((b) => new Date(b.date).getTime() >= cutoff) };
}

function buildSmaSeries(bars: SymbolHistory["bars"], period: number, visibleCount = CHART_BARS): number[] {
  const visibleBars = bars.slice(-visibleCount);
  const startIndex = bars.length - visibleBars.length;
  return visibleBars.map((_, i) => sma(bars, period, startIndex + i));
}


app.use(authProvidersRouter);
app.use(
  createTickersRouter({
    lookupTicker: async (symbol) => {
      const history = await provider.getDailyHistory(symbol, 30).catch(() => null);
      if (!history || history.bars.length === 0) return null;
      const [name, profile] = await Promise.all([
        getQuoteName(symbol).catch(() => ""),
        // Left null on failure so the next startup backfill retries it.
        getTickerProfile(symbol).catch(() => null),
      ]);
      return { name, profile };
    },
    onChange: () => {
      clearCache("breakout");
      earningsCache = null;
    },
  })
);
app.use(
  createEtfsRouter({
    lookupEtf: async (symbol) => {
      const history = await provider.getDailyHistory(symbol, 30).catch(() => null);
      if (!history || history.bars.length === 0) return null;
      const [name, profile] = await Promise.all([getQuoteName(symbol).catch(() => ""), getTickerProfile(symbol)]);
      // Prices are converted from pence by currency, so an ETF can't be added without one.
      if (!profile.currency) throw new Error(`No currency for ${symbol}`);
      return { name, currency: profile.currency };
    },
  })
);
app.use(createWatchlistsRouter({ isKnownSymbol: (symbol) => symbol in chartableSecurities().names }));

let scanInFlight: Promise<SymbolHistory[]> | null = null;

/** True when the client asked to skip the 5-minute price cache (its Refresh button). */
function wantsFresh(req: Request): boolean {
  return req.query.fresh === "1";
}

/**
 * Every tracked ticker's history, from the 5-minute cache when warm (unless
 * `fresh`). Concurrent requests (e.g. the home page and Breakout together)
 * share one fetch instead of each pulling every ticker from the provider.
 */
async function loadScanHistories(fresh = false): Promise<SymbolHistory[]> {
  const cached = fresh ? null : getCached("breakout");
  if (cached) return cached;
  scanInFlight ??= provider
    .getManyDailyHistories(listSymbols(), LOOKBACK_CALENDAR_DAYS)
    .then((histories) => {
      setCache("breakout", histories);
      return histories;
    })
    .finally(() => {
      scanInFlight = null;
    });
  return scanInFlight;
}

/** SPY's history from the cache (unless `fresh`), else fetched; empty bars if the fetch fails. */
async function loadBenchmark(fresh = false): Promise<SymbolHistory> {
  const cached = fresh ? null : getCached("benchmark")?.[0];
  if (cached) return cached;
  const benchmark = await provider
    .getDailyHistory(BENCHMARK_SYMBOL, LOOKBACK_CALENDAR_DAYS)
    .catch((): SymbolHistory => ({ symbol: BENCHMARK_SYMBOL, bars: [] }));
  if (benchmark.bars.length > 0) setCache("benchmark", [benchmark]);
  return benchmark;
}

// RS Ratings rank the whole scan, so they're computed once per cached scan.
const ratingsByScan = new WeakMap<SymbolHistory[], Map<string, number>>();
function scanRsRatings(histories: SymbolHistory[]): Map<string, number> {
  let ratings = ratingsByScan.get(histories);
  if (!ratings) {
    ratings = rsRatings(histories);
    ratingsByScan.set(histories, ratings);
  }
  return ratings;
}

/**
 * RS inputs for screening individual symbols. RS Ratings come from the
 * cached scan, so they're null (and skipped) when the scan isn't warm.
 */
async function loadBreakoutContext(): Promise<(symbol: string) => BreakoutContext> {
  const scan = getCached("breakout");
  const benchmark = await loadBenchmark();
  const ratings = scan ? scanRsRatings(scan) : new Map<string, number>();
  const benchmarkBars = benchmark.bars.length > 0 ? benchmark.bars : undefined;
  return (symbol) => ({ rsRating: ratings.get(symbol) ?? null, benchmarkBars });
}

/** Scan histories in major units (pence → pounds), plus warnings for any that failed to fetch. */
async function loadScan(fresh = false) {
  const [histories, benchmark] = await Promise.all([loadScanHistories(fresh), loadBenchmark(fresh)]);
  const currencies = getCurrencyMap();
  return {
    currencies,
    benchmarkBars: benchmark.bars.length > 0 ? benchmark.bars : undefined,
    warnings: histories.filter((h) => h.bars.length === 0).map((h) => `Skipped ${h.symbol}: fetch failed`),
    histories: histories.filter((h) => h.bars.length > 0).map((h) => toMajorUnits(h, currencies[h.symbol] ?? null)),
  };
}

const withCurrency =
  (currencies: Record<string, string | null>) =>
  <T extends { symbol: string }>(r: T) => ({ ...r, currency: displayCurrency(currencies[r.symbol] ?? null) });

app.get("/api/breakout", requireAuth, async (_req, res) => {
  try {
    const { histories, currencies, warnings, benchmarkBars } = await loadScan();
    const { triggered, approaching } = scanBreakoutScreen(histories, DEFAULT_BREAKOUT_CONFIG, getNameMap(), benchmarkBars);
    const response: BreakoutScanResponse = {
      triggered: triggered.map(withCurrency(currencies)),
      approaching: approaching.map(withCurrency(currencies)),
      warnings,
    };
    res.json(response);
  } catch (err) {
    console.error("Breakout scan failed:", err);
    res.status(502).json({ error: "Breakout scan failed", message: (err as Error).message });
  }
});

const OVERVIEW_TOP_BREAKOUTS = 5;

app.get("/api/overview", requireAuth, async (req, res) => {
  try {
    const { histories, currencies, warnings, benchmarkBars } = await loadScan(wantsFresh(req));
    const names = getNameMap();
    const overview = computeMarketOverview(histories, names);
    const { triggered, approaching } = scanBreakoutScreen(histories, DEFAULT_BREAKOUT_CONFIG, names, benchmarkBars);
    const response: OverviewResponse = {
      ...overview,
      gainers: overview.gainers.map(withCurrency(currencies)),
      losers: overview.losers.map(withCurrency(currencies)),
      tracked: histories.length + warnings.length,
      breakouts: {
        triggeredCount: triggered.length,
        approachingCount: approaching.length,
        top: triggered.slice(0, OVERVIEW_TOP_BREAKOUTS).map(withCurrency(currencies)),
      },
      warnings,
    };
    res.json(response);
  } catch (err) {
    console.error("Overview failed:", err);
    res.status(502).json({ error: "Overview failed", message: (err as Error).message });
  }
});

// Group keys for sector stats; "" is the uncategorised group, matching tickers with no sector.
const INDUSTRY_KEY_SEPARATOR = "\u0000";

app.get("/api/sector-stats", requireAuth, async (_req, res) => {
  try {
    const { histories } = await loadScan();
    const tickers = new Map(listTickers().map((t) => [t.symbol, t]));
    const sectorOf = (symbol: string) => (tickers.has(symbol) ? (tickers.get(symbol)!.sector ?? "") : null);
    const bySector = computeGroupStats(histories, sectorOf);
    const byIndustry = computeGroupStats(histories, (symbol) => {
      const t = tickers.get(symbol);
      return t ? `${t.sector ?? ""}${INDUSTRY_KEY_SEPARATOR}${t.industry ?? ""}` : null;
    });
    const response: SectorStatsResponse = {
      asOf: bySector.asOf,
      sectors: [...bySector.groups].map(([sector, stats]) => ({ sector, ...stats })),
      industries: [...byIndustry.groups].map(([key, stats]) => {
        const [sector, industry] = key.split(INDUSTRY_KEY_SEPARATOR);
        return { sector, industry, ...stats };
      }),
    };
    res.json(response);
  } catch (err) {
    console.error("Sector stats failed:", err);
    res.status(502).json({ error: "Sector stats failed", message: (err as Error).message });
  }
});

app.get("/api/industry-groups", requireAuth, async (_req, res) => {
  try {
    const { histories, currencies, warnings, benchmarkBars } = await loadScan();
    const profiles = Object.fromEntries(listTickers().map((t) => [t.symbol, t]));
    const { rankedGroups, groups } = rankIndustryGroups(histories, profiles, undefined, benchmarkBars);
    const response: IndustryGroupsResponse = {
      asOf: computeMarketOverview(histories).asOf,
      rankedGroups,
      groups: groups.map((g) => ({ ...g, members: g.members.map(withCurrency(currencies)) })),
      warnings,
    };
    res.json(response);
  } catch (err) {
    console.error("Industry groups failed:", err);
    res.status(502).json({ error: "Industry groups failed", message: (err as Error).message });
  }
});

/** Names and currencies for everything /api/stocks can chart: tracked tickers plus the curated ETFs. */
function chartableSecurities(): { names: Record<string, string>; currencies: Record<string, string | null> } {
  const etfs = listEtfs();
  return {
    names: { ...Object.fromEntries(etfs.map((e) => [e.symbol, e.name])), ...getNameMap() },
    currencies: { ...Object.fromEntries(etfs.map((e) => [e.symbol, e.currency])), ...getCurrencyMap() },
  };
}

app.get("/api/stocks", requireAuth, async (req, res) => {
  const { names, currencies } = chartableSecurities();
  const requested = String(req.query.symbols ?? "")
    .split(",")
    .map((s) => normalizeSymbol(s))
    .filter((s): s is string => s !== null && s in names);
  const symbols = [...new Set(requested)];
  if (symbols.length > MAX_STOCKS_PER_REQUEST) {
    res.status(400).json({ error: `Request at most ${MAX_STOCKS_PER_REQUEST} symbols at a time` });
    return;
  }

  try {
    // Reuse the breakout scan's histories when warm, then per-symbol
    // entries from earlier searches, and only fetch what's left.
    const fresh = wantsFresh(req);
    const scanned = new Map((fresh ? [] : (getCached("breakout") ?? [])).map((h) => [h.symbol, h]));
    const histories = new Map<string, SymbolHistory>();
    for (const symbol of fresh ? [] : symbols) {
      const history = scanned.get(symbol) ?? getCached(`stock:${symbol}`)?.[0];
      if (history && history.bars.length > 0) histories.set(symbol, history);
    }
    const missing = symbols.filter((s) => !histories.has(s));
    if (missing.length > 0) {
      for (const history of await provider.getManyDailyHistories(missing, LOOKBACK_CALENDAR_DAYS)) {
        if (history.bars.length === 0) continue;
        histories.set(history.symbol, history);
        setCache(`stock:${history.symbol}`, [history]);
      }
    }

    const contextFor = await loadBreakoutContext();
    const stocks: StockCard[] = [];
    const warnings: string[] = [];
    for (const symbol of symbols) {
      const raw = histories.get(symbol);
      if (!raw) {
        warnings.push(`Skipped ${symbol}: fetch failed`);
        continue;
      }
      const history = toMajorUnits(raw, currencies[symbol] ?? null);
      const result = runBreakoutScreen(history, DEFAULT_BREAKOUT_CONFIG, names[symbol], contextFor(symbol));
      stocks.push({
        symbol,
        name: names[symbol],
        state: result?.state ?? null,
        details: result?.details ?? null,
        currency: displayCurrency(currencies[symbol] ?? null),
        bars: history.bars.slice(-CHART_BARS),
        sma50Series: buildSmaSeries(history.bars, 50),
        sma150Series: buildSmaSeries(history.bars, 150),
      });
    }
    const response: StocksResponse = { stocks, warnings };
    res.json(response);
  } catch (err) {
    console.error("Stock lookup failed:", err);
    res.status(502).json({ error: "Failed to fetch stock data", message: (err as Error).message });
  }
});

// Earnings dates rarely move, so they're kept longer than prices.
const EARNINGS_TTL_MS = 60 * 60 * 1000;
const EARNINGS_WINDOW_DAYS = 7;
let earningsCache: { fetchedAt: number; data: Promise<{ earnings: NextEarnings[]; failed: string[] }> } | null = null;

/** Every tracked ticker's next report date, shared by concurrent requests and cached for an hour. */
function loadNextEarnings() {
  if (!earningsCache || Date.now() - earningsCache.fetchedAt > EARNINGS_TTL_MS) {
    const data = fetchNextEarnings(listSymbols());
    earningsCache = { fetchedAt: Date.now(), data };
    // Results with failures aren't kept, so the next request retries them.
    const forget = () => {
      if (earningsCache?.data === data) earningsCache = null;
    };
    data.then(({ failed }) => failed.length > 0 && forget(), forget);
  }
  return earningsCache.data;
}

app.get("/api/earnings", requireAuth, async (_req, res) => {
  try {
    const { earnings, failed } = await loadNextEarnings();
    // From the start of today, so reports already out this morning still show.
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + EARNINGS_WINDOW_DAYS + 1);
    const tickers = new Map(listTickers().map((t) => [t.symbol, t]));
    const response: EarningsResponse = {
      earnings: upcomingEarnings(earnings, from, to).map((e) => ({
        symbol: e.symbol,
        name: tickers.get(e.symbol)?.name ?? "",
        sector: tickers.get(e.symbol)?.sector ?? null,
        date: e.date.toISOString(),
        session: marketSession(e.date, e.timezone),
        estimated: e.estimated,
      })),
      warnings: failed.length > 0 ? [`Couldn't fetch earnings dates for ${failed.length} tickers`] : [],
    };
    res.json(response);
  } catch (err) {
    console.error("Earnings calendar failed:", err);
    res.status(502).json({ error: "Earnings calendar failed", message: (err as Error).message });
  }
});

app.get("/api/volatility", requireAuth, async (_req, res) => {
  try {
    let histories = getCached("volatility");
    if (!histories) {
      histories = await provider.getManyDailyHistories(Object.keys(VOLATILITY_INDICES), LOOKBACK_CALENDAR_DAYS);
      // Only a complete set is kept, so a failed index is retried next time.
      if (histories.every((h) => h.bars.length > 0)) setCache("volatility", histories);
    }
    if (!histories.some((h) => h.symbol === "^VIX" && h.bars.length > 0)) {
      res.status(502).json({ error: "Volatility data unavailable", message: "VIX fetch failed" });
      return;
    }
    const response: VolatilityResponse = {
      ...summarizeVolatility(histories),
      warnings: histories.filter((h) => h.bars.length === 0).map((h) => `Skipped ${h.symbol}: fetch failed`),
    };
    res.json(response);
  } catch (err) {
    console.error("Volatility failed:", err);
    res.status(502).json({ error: "Volatility data unavailable", message: (err as Error).message });
  }
});

app.get("/api/sector-rotation", requireAuth, async (req, res) => {
  try {
    const fresh = wantsFresh(req);
    const cached = fresh ? null : getCached("sector-rotation");
    const [sectorHistories, benchmarkHistory] = await Promise.all([
      cached ??
        provider.getManyDailyHistories(Object.keys(SECTOR_ETFS), LOOKBACK_CALENDAR_DAYS).then((sectors) => {
          setCache("sector-rotation", sectors);
          return sectors;
        }),
      loadBenchmark(fresh),
    ]);

    if (benchmarkHistory.bars.length === 0) {
      res.status(502).json({
        error: "Sector rotation scan failed",
        message: `Benchmark ${BENCHMARK_SYMBOL} fetch failed`,
      });
      return;
    }

    const warnings = sectorHistories
      .filter((h) => h.bars.length === 0)
      .map((h) => `Skipped ${h.symbol}: fetch failed`);
    const validHistories = sectorHistories.filter((h) => h.bars.length > 0);

    const results = runSectorRotationScreen(validHistories, benchmarkHistory);
    const response: SectorRotationScanResponse = { results, warnings };
    res.json(response);
  } catch (err) {
    console.error("Sector rotation scan failed:", err);
    res.status(502).json({ error: "Sector rotation scan failed", message: (err as Error).message });
  }
});

app.get("/api/stock/:symbol", requireAuth, async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  const etf = getEtf(symbol);
  const name = getTickerName(symbol) || etf?.name || "";
  try {
    const cacheKey = `detail:${symbol}`;
    let raw = getCached(cacheKey)?.[0];
    if (!raw) {
      raw = await provider.getDailyHistory(symbol, DETAIL_LOOKBACK_DAYS);
      if (raw.bars.length > 0) setCache(cacheKey, [raw]);
    }
    if (raw.bars.length === 0) {
      res.status(404).json({ error: `No data for ${symbol}` });
      return;
    }
    const currency = getTickerCurrency(symbol) ?? etf?.currency ?? null;
    const history = toMajorUnits(raw, currency);
    const visibleCount = Math.min(history.bars.length, DETAIL_CHART_BARS);
    // The screen sees the same window as the scan, so the detail page agrees with it.
    const scanned = getCached("breakout")?.find((h) => h.symbol === symbol && h.bars.length > 0);
    const screenHistory = scanned ? toMajorUnits(scanned, currency) : trimToCalendarDays(history, LOOKBACK_CALENDAR_DAYS);
    const contextFor = await loadBreakoutContext();
    const screenResult = runBreakoutScreen(screenHistory, DEFAULT_BREAKOUT_CONFIG, name, contextFor(symbol));
    const [fundamentals, news] = await Promise.all([
      getStockFundamentals(symbol).catch((err) => {
        console.error(`Fundamentals fetch failed for ${symbol}:`, err.message);
        return { financials: null, epsHistory: [], profile: null };
      }),
      getCompanyNews(symbol, name).catch((err) => {
        console.error(`News fetch failed for ${symbol}:`, err.message);
        return [];
      }),
    ]);
    const response: StockDetailResponse = {
      symbol,
      name,
      currency: displayCurrency(currency),
      bars: history.bars.slice(-visibleCount),
      sma50Series: buildSmaSeries(history.bars, 50, visibleCount),
      sma150Series: buildSmaSeries(history.bars, 150, visibleCount),
      sma200Series: buildSmaSeries(history.bars, 200, visibleCount),
      details: screenResult?.details ?? null,
      financials: fundamentals.financials,
      epsHistory: fundamentals.epsHistory,
      profile: fundamentals.profile,
      news,
    };
    res.json(response);
  } catch (err) {
    console.error(`Stock detail failed for ${symbol}:`, err);
    res.status(502).json({ error: "Failed to fetch stock data", message: (err as Error).message });
  }
});

app.get("/api/stock/:symbol/chart", requireAuth, async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  const timeframe = req.query.timeframe;
  if (timeframe !== "weekly" && timeframe !== "monthly") {
    res.status(400).json({ error: "timeframe must be weekly or monthly" });
    return;
  }
  const { lookbackDays, visibleBars } = LONG_TERM_CHARTS[timeframe];
  try {
    const cacheKey = `chart:${timeframe}:${symbol}`;
    let raw = getCached(cacheKey)?.[0];
    if (!raw) {
      raw = await provider.getDailyHistory(symbol, lookbackDays);
      if (raw.bars.length > 0) setCache(cacheKey, [raw]);
    }
    if (raw.bars.length === 0) {
      res.status(404).json({ error: `No data for ${symbol}` });
      return;
    }
    const currency = getTickerCurrency(symbol) ?? getEtf(symbol)?.currency ?? null;
    const bars = resampleBars(toMajorUnits(raw, currency).bars, timeframe);
    const visibleCount = Math.min(bars.length, visibleBars);
    const [fastPeriod, slowPeriod] = LONG_TERM_SMA_PERIODS;
    const response: StockChartResponse = {
      timeframe,
      bars: bars.slice(-visibleCount),
      smaPeriods: LONG_TERM_SMA_PERIODS,
      smaFastSeries: buildSmaSeries(bars, fastPeriod, visibleCount),
      smaSlowSeries: buildSmaSeries(bars, slowPeriod, visibleCount),
      smaLong: { period: LONG_TERM_LONG_SMA_PERIOD, series: buildSmaSeries(bars, LONG_TERM_LONG_SMA_PERIOD, visibleCount) },
    };
    res.json(response);
  } catch (err) {
    console.error(`Stock ${timeframe} chart failed for ${symbol}:`, err);
    res.status(502).json({ error: "Failed to fetch stock data", message: (err as Error).message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  await migrate();
  await Promise.all([loadTickers(), loadEtfs()]);
  const onListening = () => {
    console.log(`API server listening on http://${HOST ?? "localhost"}:${PORT}`);
    backfillProfiles(getTickerProfile)
      .then(({ updated, failed }) => {
        if (updated || failed) console.log(`Profile backfill: ${updated} updated, ${failed} failed (retried next start)`);
      })
      .catch((err) => console.error("Profile backfill failed:", err));
  };
  if (HOST) app.listen(PORT, HOST, onListening);
  else app.listen(PORT, onListening);
}

start().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
