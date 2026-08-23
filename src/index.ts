import * as fs from "fs";
import * as path from "path";
import { YahooMarketDataProvider } from "./data/yahooProvider";
import { runBreakoutScreen, scanForBreakouts, scanForNearBreakouts, DEFAULT_BREAKOUT_CONFIG } from "./screens/breakoutScreen";
import { runSectorRotationScreen, SECTOR_ETFS } from "./screens/sectorRotationScreen";
import { buildNearBreakoutReport } from "./report/htmlReport";
import { SAMPLE_UNIVERSE, BENCHMARK_SYMBOL } from "./universe";

const LOOKBACK_CALENDAR_DAYS = 400; // covers 200+ trading days with margin for weekends/holidays

// Pass --verbose (or set VERBOSE=1) to see why each symbol did or didn't
// pass, instead of only seeing the symbols that fully qualify. Since all
// three conditions (trend template + consolidation + breakout trigger)
// have to align on the same day, zero full passes on a given day across
// a 30-stock sample is common — verbose mode tells you whether that's
// "no breakouts today" or "something's misconfigured/broken".
const VERBOSE = process.argv.includes("--verbose") || process.env.VERBOSE === "1";

async function main() {
  const provider = new YahooMarketDataProvider();

  console.log(`Fetching history for ${SAMPLE_UNIVERSE.length} symbols...`);
  const histories = await provider.getManyDailyHistories(SAMPLE_UNIVERSE, LOOKBACK_CALENDAR_DAYS);

  const emptyHistories = histories.filter((h) => h.bars.length === 0);
  if (emptyHistories.length > 0) {
    console.log(
      `\nWarning: ${emptyHistories.length}/${histories.length} symbols returned no data ` +
        `(fetch failures): ${emptyHistories.map((h) => h.symbol).join(", ")}`
    );
  }

  console.log("\n=== Breakout Screen ===");
  const breakouts = scanForBreakouts(histories, DEFAULT_BREAKOUT_CONFIG);

  if (VERBOSE) {
    // Show every symbol's condition-by-condition result, not just full passes.
    for (const history of histories) {
      if (history.bars.length === 0) continue;
      const result = runBreakoutScreen(history, DEFAULT_BREAKOUT_CONFIG);
      if (result === null) {
        console.log(`${history.symbol}: SKIPPED — only ${history.bars.length} bars (need 220+)`);
        continue;
      }
      console.log(
        `${result.symbol}: trend=${result.passesTrendTemplate ? "PASS" : "fail"} ` +
          `consolidating=${result.isConsolidating ? "PASS" : "fail"} ` +
          `breakout=${result.isBreakingOut ? "PASS" : "fail"} ` +
          `| close=${result.details.close.toFixed(2)} sma150=${result.details.sma150.toFixed(2)} ` +
          `sma200=${result.details.sma200.toFixed(2)} pctOffHigh=${result.details.pctOff52wHigh.toFixed(1)}% ` +
          `range=${result.details.rangeContractionPct.toFixed(1)}% pivot=${result.details.pivotHigh.toFixed(2)} ` +
          `volRatio=${result.details.volumeRatio.toFixed(2)}x`
      );
    }
    console.log("");
  }

  if (breakouts.length === 0) {
    console.log(
      "No symbols currently passing the full breakout screen " +
        "(run with --verbose to see each symbol's individual condition results)."
    );
  } else {
    for (const result of breakouts) {
      console.log(
        `${result.symbol}: close=${result.details.close.toFixed(2)} ` +
          `pivot=${result.details.pivotHigh.toFixed(2)} ` +
          `volRatio=${result.details.volumeRatio.toFixed(2)}x ` +
          `range=${result.details.rangeContractionPct.toFixed(1)}%`
      );
    }
  }

  console.log("\n=== Near-Breakout Candidates ===");
  const nearBreakouts = scanForNearBreakouts(histories, DEFAULT_BREAKOUT_CONFIG, 10);
  if (nearBreakouts.length === 0) {
    console.log("No candidates passing the trend template + consolidation filter right now.");
  } else {
    for (const c of nearBreakouts) {
      const label = c.proximityToPivotPct <= 0 ? "at/above pivot" : `${c.proximityToPivotPct.toFixed(1)}% below pivot`;
      console.log(`${c.symbol}: ${label} (close=${c.details.close.toFixed(2)}, pivot=${c.details.pivotHigh.toFixed(2)})`);
    }

    const historiesBySymbol = new Map(histories.map((h) => [h.symbol, h]));
    const reportHtml = buildNearBreakoutReport(nearBreakouts, historiesBySymbol);
    const outputDir = path.join(__dirname, "..", "output");
    fs.mkdirSync(outputDir, { recursive: true });
    const reportPath = path.join(outputDir, "near-breakout-report.html");
    fs.writeFileSync(reportPath, reportHtml);
    console.log(`\nChart report written to: ${reportPath}`);
    console.log("Open that file in a browser to see the consolidation charts.");
  }

  console.log("\n=== Sector Rotation ===");
  const sectorSymbols = Object.keys(SECTOR_ETFS);
  const [sectorHistories, benchmarkHistory] = await Promise.all([
    provider.getManyDailyHistories(sectorSymbols, LOOKBACK_CALENDAR_DAYS),
    provider.getDailyHistory(BENCHMARK_SYMBOL, LOOKBACK_CALENDAR_DAYS),
  ]);

  const rotation = runSectorRotationScreen(sectorHistories, benchmarkHistory);
  for (const r of rotation) {
    console.log(
      `#${r.rank} ${r.sectorSymbol} (${r.sectorName}): ` +
        `RS 1m=${r.relativeStrength1m.toFixed(2)} 3m=${r.relativeStrength3m.toFixed(2)} 6m=${r.relativeStrength6m.toFixed(2)} ` +
        `flow=${r.moneyFlowTrend}`
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
