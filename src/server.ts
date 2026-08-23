import express from "express";
import { YahooMarketDataProvider } from "./data/yahooProvider";
import { scanBreakoutScreen, DEFAULT_BREAKOUT_CONFIG } from "./screens/breakoutScreen";
import { runSectorRotationScreen, SECTOR_ETFS } from "./screens/sectorRotationScreen";
import { SAMPLE_UNIVERSE, BENCHMARK_SYMBOL } from "./universe";
import { sma } from "./indicators/movingAverage";
import {
  BreakoutScanResponse,
  BreakoutScreenResult,
  Candidate,
  SectorRotationScanResponse,
  SymbolHistory,
} from "./types";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const LOOKBACK_CALENDAR_DAYS = 400; // covers 200+ trading days with margin for weekends/holidays
const CHART_BARS = 120;

const provider = new YahooMarketDataProvider();

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

app.get("/api/breakout", async (_req, res) => {
  try {
    const histories = await provider.getManyDailyHistories(SAMPLE_UNIVERSE, LOOKBACK_CALENDAR_DAYS);
    const warnings = histories
      .filter((h) => h.bars.length === 0)
      .map((h) => `Skipped ${h.symbol}: fetch failed`);
    const validHistories = histories.filter((h) => h.bars.length > 0);
    const historiesBySymbol = new Map(validHistories.map((h) => [h.symbol, h]));

    const { triggered, approaching } = scanBreakoutScreen(validHistories, DEFAULT_BREAKOUT_CONFIG);

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

app.get("/api/sector-rotation", async (_req, res) => {
  try {
    const sectorSymbols = Object.keys(SECTOR_ETFS);
    const [sectorHistories, benchmarkHistory] = await Promise.all([
      provider.getManyDailyHistories(sectorSymbols, LOOKBACK_CALENDAR_DAYS),
      provider.getDailyHistory(BENCHMARK_SYMBOL, LOOKBACK_CALENDAR_DAYS),
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

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
