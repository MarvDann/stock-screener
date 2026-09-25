import express from "express";
import { YahooMarketDataProvider } from "./data/yahooProvider";
import { FmpMarketDataProvider } from "./data/fmpProvider";
import { getQuoteName, getStockFundamentals, getTickerProfile } from "./data/yahooFinancials";
import { runBreakoutScreen, scanBreakoutScreen, DEFAULT_BREAKOUT_CONFIG } from "./screens/breakoutScreen";
import { runSectorRotationScreen, SECTOR_ETFS } from "./screens/sectorRotationScreen";
import { BENCHMARK_SYMBOL } from "./universe";
import { sma } from "./indicators/movingAverage";
import {
  BreakoutScanResponse,
  MarketDataProvider,
  OverviewResponse,
  SectorStatsResponse,
  SectorRotationScanResponse,
  StockCard,
  StockDetailResponse,
  StocksResponse,
  SymbolHistory,
} from "./types";
import "./db";
import authRouter from "./auth";
import { requireAuth } from "./middleware/requireAuth";
import { clearCache, getCached, setCache } from "./cache";
import {
  backfillProfiles,
  createTickersRouter,
  getCurrencyMap,
  getNameMap,
  getTickerCurrency,
  getTickerName,
  listSymbols,
  listTickers,
  normalizeSymbol,
} from "./tickers";
import { displayCurrency, toMajorUnits } from "./currency";
import { ETF_CATEGORIES, getEtf, listEtfs } from "./etfs";
import { computeGroupStats, computeMarketOverview } from "./screens/marketOverview";

const app = express();
app.use(express.json());
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const LOOKBACK_CALENDAR_DAYS = 400; // covers 200+ trading days with margin for weekends/holidays
const CHART_BARS = 120;
const DETAIL_CHART_BARS = 252;
const DETAIL_LOOKBACK_DAYS = 550;
const MAX_STOCKS_PER_REQUEST = 24;

const DATA_PROVIDER = process.env.DATA_PROVIDER ?? "fmp";
const provider: MarketDataProvider =
  DATA_PROVIDER === "yahoo" ? new YahooMarketDataProvider() : new FmpMarketDataProvider();

function buildSmaSeries(bars: SymbolHistory["bars"], period: number, visibleCount = CHART_BARS): number[] {
  const visibleBars = bars.slice(-visibleCount);
  const startIndex = bars.length - visibleBars.length;
  return visibleBars.map((_, i) => sma(bars, period, startIndex + i));
}


app.use(authRouter);
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
    onChange: () => clearCache("breakout"),
  })
);

let scanInFlight: Promise<SymbolHistory[]> | null = null;

/**
 * Every tracked ticker's history, from the 5-minute cache when warm.
 * Concurrent cold requests (e.g. the home page and Breakout together) share
 * one fetch instead of each pulling every ticker from the provider.
 */
async function loadScanHistories(): Promise<SymbolHistory[]> {
  const cached = getCached("breakout");
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

/** Scan histories in major units (pence → pounds), plus warnings for any that failed to fetch. */
async function loadScan() {
  const histories = await loadScanHistories();
  const currencies = getCurrencyMap();
  return {
    currencies,
    warnings: histories.filter((h) => h.bars.length === 0).map((h) => `Skipped ${h.symbol}: fetch failed`),
    histories: histories.filter((h) => h.bars.length > 0).map((h) => toMajorUnits(h, currencies[h.symbol] ?? null)),
  };
}

const withCurrency =
  (currencies: Record<string, string | null>) =>
  <T extends { symbol: string }>(r: T) => ({ ...r, currency: displayCurrency(currencies[r.symbol] ?? null) });

app.get("/api/breakout", requireAuth, async (_req, res) => {
  try {
    const { histories, currencies, warnings } = await loadScan();
    const { triggered, approaching } = scanBreakoutScreen(histories, DEFAULT_BREAKOUT_CONFIG, getNameMap());
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

app.get("/api/overview", requireAuth, async (_req, res) => {
  try {
    const { histories, currencies, warnings } = await loadScan();
    const names = getNameMap();
    const overview = computeMarketOverview(histories, names);
    const { triggered, approaching } = scanBreakoutScreen(histories, DEFAULT_BREAKOUT_CONFIG, names);
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

/** Names and currencies for everything /api/stocks can chart: tracked tickers plus the curated ETFs. */
function chartableSecurities(): { names: Record<string, string>; currencies: Record<string, string | null> } {
  const etfs = listEtfs();
  return {
    names: { ...Object.fromEntries(etfs.map((e) => [e.symbol, e.name])), ...getNameMap() },
    currencies: { ...Object.fromEntries(etfs.map((e) => [e.symbol, e.currency])), ...getCurrencyMap() },
  };
}

app.get("/api/etfs", requireAuth, (_req, res) => {
  res.json({
    categories: ETF_CATEGORIES,
    etfs: listEtfs().map(({ symbol, name, category }) => ({ symbol, name, category })),
  });
});

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
    const scanned = new Map((getCached("breakout") ?? []).map((h) => [h.symbol, h]));
    const histories = new Map<string, SymbolHistory>();
    for (const symbol of symbols) {
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

    const stocks: StockCard[] = [];
    const warnings: string[] = [];
    for (const symbol of symbols) {
      const raw = histories.get(symbol);
      if (!raw) {
        warnings.push(`Skipped ${symbol}: fetch failed`);
        continue;
      }
      const history = toMajorUnits(raw, currencies[symbol] ?? null);
      const result = runBreakoutScreen(history, DEFAULT_BREAKOUT_CONFIG, names[symbol]);
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

app.get("/api/sector-rotation", requireAuth, async (_req, res) => {
  try {
    const sectorSymbols = Object.keys(SECTOR_ETFS);
    let sectorHistories = getCached("sector-rotation");
    let benchmarkHistory: SymbolHistory;
    if (sectorHistories) {
      benchmarkHistory = getCached("benchmark")?.[0] ?? await provider.getDailyHistory(BENCHMARK_SYMBOL, LOOKBACK_CALENDAR_DAYS);
    } else {
      const [sectors, benchmark] = await Promise.all([
        provider.getManyDailyHistories(sectorSymbols, LOOKBACK_CALENDAR_DAYS),
        provider.getDailyHistory(BENCHMARK_SYMBOL, LOOKBACK_CALENDAR_DAYS),
      ]);
      sectorHistories = sectors;
      benchmarkHistory = benchmark;
      setCache("sector-rotation", sectorHistories);
      setCache("benchmark", [benchmarkHistory]);
    }

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
    const cached = getCached("breakout");
    let raw = cached?.find((h) => h.symbol === symbol);
    if (!raw || raw.bars.length === 0) {
      raw = await provider.getDailyHistory(symbol, DETAIL_LOOKBACK_DAYS);
    }
    if (raw.bars.length === 0) {
      res.status(404).json({ error: `No data for ${symbol}` });
      return;
    }
    const currency = getTickerCurrency(symbol) ?? etf?.currency ?? null;
    const history = toMajorUnits(raw, currency);
    const visibleCount = Math.min(history.bars.length, DETAIL_CHART_BARS);
    const screenResult = runBreakoutScreen(history, DEFAULT_BREAKOUT_CONFIG, name);
    const fundamentals = await getStockFundamentals(symbol).catch((err) => {
      console.error(`Fundamentals fetch failed for ${symbol}:`, err.message);
      return { financials: null, epsHistory: [] };
    });
    const response: StockDetailResponse = {
      symbol,
      name,
      currency: displayCurrency(currency),
      bars: history.bars.slice(-visibleCount),
      sma50Series: buildSmaSeries(history.bars, 50, visibleCount),
      sma150Series: buildSmaSeries(history.bars, 150, visibleCount),
      details: screenResult?.details ?? null,
      financials: fundamentals.financials,
      epsHistory: fundamentals.epsHistory,
    };
    res.json(response);
  } catch (err) {
    console.error(`Stock detail failed for ${symbol}:`, err);
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

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
  backfillProfiles(getTickerProfile)
    .then(({ updated, failed }) => {
      if (updated || failed) console.log(`Profile backfill: ${updated} updated, ${failed} failed (retried next start)`);
    })
    .catch((err) => console.error("Profile backfill failed:", err));
});
