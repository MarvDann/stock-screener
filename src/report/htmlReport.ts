import { NearBreakoutCandidate } from "../screens/breakoutScreen";
import { SymbolHistory } from "../types";
import { renderPriceChartSvg } from "./svgChart";

/**
 * Builds a single self-contained HTML file showing each near-breakout
 * candidate with a price chart (close price + 150-day SMA + pivot line),
 * so patterns can actually be seen rather than just read as numbers.
 */
export function buildNearBreakoutReport(
  candidates: NearBreakoutCandidate[],
  historiesBySymbol: Map<string, SymbolHistory>
): string {
  const generatedAt = new Date().toISOString();

  const cards = candidates
    .map((c) => {
      const history = historiesBySymbol.get(c.symbol);
      const chartSvg = history
        ? renderPriceChartSvg(history.bars, { pivotHigh: c.details.pivotHigh })
        : "<p>No chart data</p>";

      const proximityLabel =
        c.proximityToPivotPct <= 0
          ? `At/above pivot (+${Math.abs(c.proximityToPivotPct).toFixed(1)}%)`
          : `${c.proximityToPivotPct.toFixed(1)}% below pivot`;

      return `
        <div class="card">
          <div class="card-header">
            <h2>${c.symbol}</h2>
            <span class="proximity">${proximityLabel}</span>
          </div>
          <div class="chart">${chartSvg}</div>
          <div class="legend">
            <span><span class="swatch close"></span>Close</span>
            <span><span class="swatch sma"></span>150-day SMA</span>
            <span><span class="swatch pivot"></span>Pivot (${c.details.pivotHigh.toFixed(2)})</span>
          </div>
          <table>
            <tr><td>Close</td><td>${c.details.close.toFixed(2)}</td></tr>
            <tr><td>SMA150 / SMA200</td><td>${c.details.sma150.toFixed(2)} / ${c.details.sma200.toFixed(2)}</td></tr>
            <tr><td>% off 52w high</td><td>${c.details.pctOff52wHigh.toFixed(1)}%</td></tr>
            <tr><td>Range contraction</td><td>${c.details.rangeContractionPct.toFixed(1)}%</td></tr>
            <tr><td>Volume ratio (last close)</td><td>${c.details.volumeRatio.toFixed(2)}x</td></tr>
          </table>
        </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Near-Breakout Candidates</title>
<style>
  :root { --pivot-color: #d97706; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; margin: 0; padding: 32px; color: #1e293b; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
  .card { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
  .card-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .card-header h2 { font-size: 16px; margin: 0; }
  .proximity { font-size: 12px; color: #d97706; font-weight: 600; }
  .chart svg { width: 100%; height: auto; }
  .legend { display: flex; gap: 14px; font-size: 11px; color: #64748b; margin: 8px 0; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
  .swatch.close { background: #2563eb; }
  .swatch.sma { background: #9333ea; }
  .swatch.pivot { background: #d97706; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  table td { padding: 3px 0; border-top: 1px solid #f1f5f9; }
  table td:first-child { color: #64748b; }
  table td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .empty { color: #64748b; }
</style>
</head>
<body>
  <h1>Near-Breakout Candidates</h1>
  <div class="meta">Generated ${generatedAt} — stocks passing the trend template and consolidating, ranked by proximity to their pivot.</div>
  <div class="grid">
    ${candidates.length > 0 ? cards : '<p class="empty">No candidates found — try loosening maxPctOffHigh or the consolidation thresholds.</p>'}
  </div>
</body>
</html>`;
}
