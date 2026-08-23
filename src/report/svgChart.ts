import { DailyBar } from "../types";
import { sma } from "../indicators/movingAverage";

export interface ChartOptions {
  width: number;
  height: number;
  /** How many trailing trading days to plot. */
  lookbackBars: number;
  /** Horizontal reference line for the consolidation pivot. */
  pivotHigh: number;
}

const DEFAULT_CHART_OPTIONS: ChartOptions = {
  width: 640,
  height: 260,
  lookbackBars: 90,
  pivotHigh: NaN,
};

/**
 * Renders a self-contained SVG line chart of closing price, with the
 * 150-day SMA overlaid and a horizontal line marking the consolidation
 * pivot. No external chart library required — plain SVG path math.
 */
export function renderPriceChartSvg(
  bars: DailyBar[],
  options: Partial<ChartOptions> = {}
): string {
  const opts = { ...DEFAULT_CHART_OPTIONS, ...options };
  const { width, height, lookbackBars, pivotHigh } = opts;
  const padding = { top: 16, right: 16, bottom: 24, left: 56 };

  const plotBars = bars.slice(-lookbackBars);
  if (plotBars.length < 2) {
    return `<svg width="${width}" height="${height}"><text x="10" y="20">Not enough data</text></svg>`;
  }

  const startIndex = bars.length - plotBars.length;

  // SMA150 aligned to the plotted window (may be NaN for early bars if
  // there isn't 150 days of history before the window starts).
  const sma150Series = plotBars.map((_, i) => sma(bars, 150, startIndex + i));

  const closes = plotBars.map((b) => b.close);
  const allValues = [
    ...closes,
    ...sma150Series.filter((v) => !isNaN(v)),
    ...(isNaN(pivotHigh) ? [] : [pivotHigh]),
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const valueRange = maxVal - minVal || 1;

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const xForIndex = (i: number) => padding.left + (i / (plotBars.length - 1)) * plotWidth;
  const yForValue = (v: number) => padding.top + plotHeight - ((v - minVal) / valueRange) * plotHeight;

  const closePath = closes
    .map((c, i) => `${i === 0 ? "M" : "L"} ${xForIndex(i).toFixed(1)} ${yForValue(c).toFixed(1)}`)
    .join(" ");

  const smaPoints = sma150Series
    .map((v, i) => (isNaN(v) ? null : `${xForIndex(i).toFixed(1)},${yForValue(v).toFixed(1)}`))
    .filter((p): p is string => p !== null);
  const smaPath = smaPoints.length > 1 ? `M ${smaPoints.join(" L ")}` : "";

  const pivotLine = !isNaN(pivotHigh)
    ? `<line x1="${padding.left}" y1="${yForValue(pivotHigh).toFixed(1)}" ` +
      `x2="${width - padding.right}" y2="${yForValue(pivotHigh).toFixed(1)}" ` +
      `stroke="var(--pivot-color, #d97706)" stroke-width="1.5" stroke-dasharray="4,3" />`
    : "";

  const yAxisLabels = [minVal, (minVal + maxVal) / 2, maxVal]
    .map(
      (v) =>
        `<text x="${padding.left - 8}" y="${yForValue(v).toFixed(1)}" font-size="10" ` +
        `text-anchor="end" dominant-baseline="middle" fill="#6b7280">${v.toFixed(2)}</text>`
    )
    .join("");

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${height}" fill="none" />
  ${yAxisLabels}
  ${pivotLine}
  ${smaPath ? `<path d="${smaPath}" fill="none" stroke="#9333ea" stroke-width="1.5" opacity="0.8" />` : ""}
  <path d="${closePath}" fill="none" stroke="#2563eb" stroke-width="2" />
</svg>`.trim();
}
