import express from "express";
import { YahooMarketDataProvider } from "./data/yahooProvider";
import { FmpMarketDataProvider } from "./data/fmpProvider";
import { scanBreakoutScreen, DEFAULT_BREAKOUT_CONFIG } from "./screens/breakoutScreen";
import { runSectorRotationScreen, SECTOR_ETFS } from "./screens/sectorRotationScreen";
import { SAMPLE_UNIVERSE, BENCHMARK_SYMBOL } from "./universe";
import { sma } from "./indicators/movingAverage";
import {
  BreakoutScanResponse,
  BreakoutScreenResult,
  Candidate,
  MarketDataProvider,
  SectorRotationScanResponse,
  SymbolHistory,
} from "./types";
import "./db";
import authRouter from "./auth";
import { requireAuth } from "./middleware/requireAuth";
import { getCached, setCache } from "./cache";
import { STOCK_NAMES } from "./stockNames";

const app = express();
app.use(express.json());
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const LOOKBACK_CALENDAR_DAYS = 400; // covers 200+ trading days with margin for weekends/holidays
const CHART_BARS = 120;

const DATA_PROVIDER = process.env.DATA_PROVIDER ?? "fmp";
const provider: MarketDataProvider =
  DATA_PROVIDER === "yahoo" ? new YahooMarketDataProvider() : new FmpMarketDataProvider();

function buildSma150Series(bars: SymbolHistory["bars"]): number[] {
  const visibleBars = bars.slice(-CHART_BARS);
  const startIndex = bars.length - visibleBars.length;
  return visibleBars.map((_, i) => sma(bars, 150, startIndex + i));
}

function toCandidate(result: BreakoutScreenResult, history: SymbolHistory): Candidate {
  return {
    ...result,
    bars: history.bars.slice(-CHART_BARS),
    sma150Series: buildSma150Series(history.bars),
  };
}

app.use(authRouter);

app.get("/api/breakout", requireAuth, async (_req, res) => {
  try {
    let histories = getCached("breakout");
    if (!histories) {
      histories = await provider.getManyDailyHistories(SAMPLE_UNIVERSE, LOOKBACK_CALENDAR_DAYS);
      setCache("breakout", histories);
    }
    const warnings = histories
      .filter((h) => h.bars.length === 0)
      .map((h) => `Skipped ${h.symbol}: fetch failed`);
    const validHistories = histories.filter((h) => h.bars.length > 0);
    const historiesBySymbol = new Map(validHistories.map((h) => [h.symbol, h]));

    const { triggered, approaching } = scanBreakoutScreen(validHistories, DEFAULT_BREAKOUT_CONFIG, STOCK_NAMES);

    const response: BreakoutScanResponse = {
      triggered: triggered.map((r) => toCandidate(r, historiesBySymbol.get(r.symbol)!)),
      approaching: approaching.map((r) => toCandidate(r, historiesBySymbol.get(r.symbol)!)),
      warnings,
    };
    res.json(response);
  } catch (err) {
    console.error("Breakout scan failed:", err);
    res.status(502).json({ error: "Breakout scan failed", message: (err as Error).message });
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

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
