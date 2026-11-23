<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { fetchVolatility } from "../api";
import type { DatedValue, LatestMove, VolatilityRegime, VolatilityResponse } from "../types";
import LineChart, { type LineSeries } from "../components/LineChart.vue";
import WarningsBanner from "../components/WarningsBanner.vue";
import { useCachedResource } from "../composables/useCachedResource";
import { useQueryParam } from "../composables/useQueryParam";
import { useTheme } from "../composables/useTheme";
import { CHART_THEMES } from "../utils/chartTheme";
import { formatOrdinal } from "../utils/format";

/** Trading sessions in each selectable range. */
const RANGES = { "1M": 21, "3M": 63, "6M": 126, "1Y": 252 } as const;
type Range = keyof typeof RANGES;

/** The three VIX tenors share a scale, so they share the main chart. Slots are fixed per index. */
const VIX_LINES: { symbol: string; label: string; slot: LineSeries["slot"]; optional: boolean }[] = [
  { symbol: "^VIX", label: "VIX (30-day)", slot: 0, optional: false },
  { symbol: "^VIX9D", label: "VIX 9-day", slot: 1, optional: true },
  { symbol: "^VIX3M", label: "VIX 3-month", slot: 2, optional: true },
];

const REGIMES: Record<VolatilityRegime, { label: string; note: string }> = {
  calm: { label: "Calm", note: "Below 15: complacent, low-fear market." },
  normal: { label: "Normal", note: "15–20: the long-run typical range." },
  elevated: { label: "Elevated", note: "20–30: nervous; hedging demand is up." },
  high: { label: "High stress", note: "30+: fear-driven, sell-off conditions." },
};

const THRESHOLDS = [
  { value: 20, label: "20 · elevated" },
  { value: 30, label: "30 · high stress" },
];
const PARITY = [{ value: 1, label: "1.0 · inverted above" }];

const { theme } = useTheme();
/** Legend keys match the chart's series colours for the current theme. */
const keyStyle = (slot: LineSeries["slot"]) => ({ "--series": CHART_THEMES[theme.value].series[slot] });

const { data, loading, error, load, updatedLabel } = useCachedResource<VolatilityResponse>("volatility", fetchVolatility);

const rangeParam = useQueryParam("range", "6M");
const range = computed<Range>({
  get: () => (rangeParam.value in RANGES ? (rangeParam.value as Range) : "6M"),
  set: (r) => (rangeParam.value = r),
});
const shown = ref(new Set(["^VIX"]));

function toggle(symbol: string) {
  const next = new Set(shown.value);
  if (next.has(symbol)) next.delete(symbol);
  else next.add(symbol);
  shown.value = next;
}

const pointsBySymbol = computed(() => new Map((data.value?.series ?? []).map((s) => [s.symbol, s.points])));

/** First date in the selected range, counted back in VIX sessions. */
const rangeStart = computed(() => {
  const vix = pointsBySymbol.value.get("^VIX") ?? [];
  return vix.at(-RANGES[range.value])?.date ?? vix[0]?.date ?? "";
});
const inRange = (points: DatedValue[]) => points.filter((p) => p.date >= rangeStart.value);

const available = computed(() => VIX_LINES.filter((l) => pointsBySymbol.value.has(l.symbol)));

const vixSeries = computed<LineSeries[]>(() =>
  available.value
    .filter((l) => shown.value.has(l.symbol))
    .map((l) => ({ key: l.symbol, label: l.label, slot: l.slot, points: inRange(pointsBySymbol.value.get(l.symbol)!) }))
);

const ratioSeries = computed<LineSeries[]>(() =>
  data.value?.termRatioSeries.length
    ? [{ key: "ratio", label: "VIX ÷ VIX 3-month", slot: 3, points: inRange(data.value.termRatioSeries) }]
    : []
);

/** Every index plus the ratio by date, newest first, for the table view. */
const tableRows = computed(() => {
  const lookup = (symbol: string) => new Map(inRange(pointsBySymbol.value.get(symbol) ?? []).map((p) => [p.date, p.value]));
  const vix = lookup("^VIX");
  const vix9d = lookup("^VIX9D");
  const vix3m = lookup("^VIX3M");
  const vvix = lookup("^VVIX");
  const ratio = new Map(inRange(data.value?.termRatioSeries ?? []).map((p) => [p.date, p.value]));
  return [...vix.keys()].reverse().map((date) => ({
    date,
    vix: vix.get(date),
    vix9d: vix9d.get(date),
    vix3m: vix3m.get(date),
    vvix: vvix.get(date),
    ratio: ratio.get(date),
  }));
});

const regime = computed(() => (data.value?.vix ? REGIMES[data.value.vix.regime] : null));
const inverted = computed(() => (data.value?.termRatio ?? 0) >= 1);

function fixed(value: number | undefined | null, digits = 2): string {
  return value == null ? "—" : value.toFixed(digits);
}

function signed(value: number | null, digits = 2, suffix = ""): string {
  if (value == null) return "";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`;
}

/** For a fear gauge, a rise is bad news: up reads red, down reads green. */
function moveClass(move: LatestMove | null): string {
  if (!move?.change) return "flat";
  return move.change > 0 ? "worse" : "better";
}

function formatAsOf(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

onMounted(() => load());
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h2>Volatility</h2>
        <p class="subtitle">
          The CBOE VIX family: the market's expected 30-day volatility of the S&amp;P 500, priced from options.
        </p>
      </div>
      <div class="header-actions">
        <span v-if="updatedLabel" class="updated">{{ updatedLabel }}</span>
        <button class="btn-primary" :disabled="loading" @click="load({ force: true })">
          {{ loading ? "Refreshing…" : "Refresh" }}
        </button>
      </div>
    </div>

    <div v-if="error && !data" class="error-state">
      <p>Couldn't load volatility data — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load({ force: true })">Retry</button>
    </div>

    <p v-else-if="!data" class="muted">Loading…</p>

    <template v-else>
      <WarningsBanner :warnings="data.warnings" />

      <!-- Headline readings -->
      <div class="stats">
        <section v-if="data.vix" class="stat-tile hero">
          <span class="stat-label">VIX<template v-if="data.asOf"> · {{ formatAsOf(data.asOf) }}</template></span>
          <div class="hero-row">
            <span class="hero-value">{{ fixed(data.vix.close) }}</span>
            <span class="move" :class="moveClass(data.vix)">
              {{ signed(data.vix.change) }} ({{ signed(data.vix.changePct, 1, "%") }})
            </span>
          </div>
          <span v-if="regime" class="regime" :class="data.vix.regime">{{ regime.label }}</span>
          <span class="stat-note">{{ regime?.note }}</span>
        </section>

        <section v-if="data.vix" class="stat-tile">
          <span class="stat-label">Past year</span>
          <span class="stat-value">{{ formatOrdinal(Math.round(data.vix.percentile1y)) }}<small>percentile</small></span>
          <span class="stat-note">
            Range {{ fixed(data.vix.low52w) }} – {{ fixed(data.vix.high52w) }}. Today's close is higher than
            {{ Math.round(data.vix.percentile1y) }}% of the past year's.
          </span>
        </section>

        <section v-if="data.termRatio != null" class="stat-tile">
          <span class="stat-label">Term structure</span>
          <span class="stat-value">{{ fixed(data.termRatio) }}<small>VIX ÷ VIX 3M</small></span>
          <span class="regime" :class="inverted ? 'high' : 'calm'">{{ inverted ? "Backwardation" : "Contango" }}</span>
          <span class="stat-note">
            {{
              inverted
                ? "Near-term fear is priced above longer-term, typical during sell-offs."
                : "Longer-dated volatility is priced higher, the market's normal state."
            }}
          </span>
        </section>

        <section v-if="data.vvix" class="stat-tile">
          <span class="stat-label">VVIX</span>
          <span class="stat-value">
            {{ fixed(data.vvix.close) }}
            <small class="move" :class="moveClass(data.vvix)">{{ signed(data.vvix.changePct, 1, "%") }}</small>
          </span>
          <span class="stat-note">Volatility of the VIX itself. Above ~100, traders expect big swings in fear.</span>
        </section>
      </div>

      <!-- Filters: one row above the charts -->
      <div class="controls">
        <div class="segmented" role="radiogroup" aria-label="Range">
          <button
            v-for="(_, r) in RANGES"
            :key="r"
            type="button"
            role="radio"
            :aria-checked="range === r"
            :class="{ active: range === r }"
            :data-range="r"
            @click="range = r"
          >
            {{ r }}
          </button>
        </div>
      </div>

      <section class="chart-card">
        <header class="chart-head">
          <h3>VIX</h3>
          <div class="legend">
            <template v-for="l in available" :key="l.symbol">
              <button
                v-if="l.optional"
                type="button"
                class="legend-item toggle"
                :class="{ off: !shown.has(l.symbol) }"
                :style="keyStyle(l.slot)"
                :aria-pressed="shown.has(l.symbol)"
                :data-series="l.symbol"
                @click="toggle(l.symbol)"
              >
                <span class="line-key"></span>{{ l.label }}
              </button>
              <span v-else class="legend-item" :style="keyStyle(l.slot)"><span class="line-key"></span>{{ l.label }}</span>
            </template>
          </div>
        </header>
        <LineChart :series="vixSeries" :reference-lines="THRESHOLDS" :height="340" />
      </section>

      <section v-if="ratioSeries.length" class="chart-card">
        <header class="chart-head">
          <h3>Term structure <span class="chart-sub">VIX ÷ VIX 3-month</span></h3>
        </header>
        <p class="chart-note">Above 1.0 the curve is inverted: short-term fear outranks longer-term, usually during sell-offs.</p>
        <LineChart :series="ratioSeries" :reference-lines="PARITY" :height="180" />
      </section>

      <details class="table-view">
        <summary>Daily values ({{ tableRows.length }} sessions)</summary>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>VIX</th>
                <th>VIX 9D</th>
                <th>VIX 3M</th>
                <th>VIX ÷ 3M</th>
                <th>VVIX</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableRows" :key="row.date">
                <td>{{ row.date }}</td>
                <td>{{ fixed(row.vix) }}</td>
                <td>{{ fixed(row.vix9d) }}</td>
                <td>{{ fixed(row.vix3m) }}</td>
                <td>{{ fixed(row.ratio, 3) }}</td>
                <td>{{ fixed(row.vvix) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.updated {
  font-size: 12px;
  color: var(--text-secondary);
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}

/* ── Stat tiles ── */
.stats {
  display: grid;
  grid-template-columns: 1.3fr repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}
@media (max-width: 1100px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .stats {
    grid-template-columns: 1fr;
  }
}
.stat-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.stat-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}
.hero-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.hero-value {
  font-family: var(--font-mono);
  font-size: 40px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--text-primary);
}
.stat-value {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}
.stat-value small {
  margin-left: 6px;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
}
.stat-note {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}
.move {
  font-family: var(--font-mono);
  font-size: 13px;
}
.move.worse {
  color: var(--negative);
}
.move.better {
  color: var(--positive);
}
.move.flat {
  color: var(--text-secondary);
}
.regime {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.regime.calm {
  color: var(--positive);
  background: var(--positive-soft);
}
.regime.normal {
  color: var(--text-secondary);
  background: var(--surface-hover);
}
.regime.elevated {
  color: var(--warning-text);
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
}
.regime.high {
  color: var(--negative);
  background: var(--negative-soft);
}

/* ── Controls ── */
.controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.segmented {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-elevated);
}
.segmented button {
  padding: 4px 12px;
  border: none;
  border-radius: 5px;
  background: none;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 12px;
  cursor: pointer;
}
.segmented button:hover {
  color: var(--text-primary);
}
.segmented button.active {
  background: var(--surface-hover);
  color: var(--text-primary);
}

/* ── Charts ── */
.chart-card {
  padding: 16px;
  margin-bottom: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.chart-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.chart-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.chart-sub {
  margin-left: 6px;
  font-weight: 400;
  color: var(--text-secondary);
}
.chart-note {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 12px;
}
.legend-item.toggle {
  border-color: var(--border);
  cursor: pointer;
}
.legend-item.toggle:hover {
  background: var(--surface-hover);
}
.legend-item.off {
  color: var(--text-muted);
}
.line-key {
  width: 14px;
  height: 2px;
  border-radius: 1px;
  background: var(--series);
}
.legend-item.off .line-key {
  background: var(--text-muted);
}

/* ── Table view ── */
.table-view {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
.table-view summary {
  cursor: pointer;
  padding: 6px 0;
}
.table-scroll {
  max-height: 360px;
  overflow: auto;
  margin-top: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.table-view table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
}
.table-view th,
.table-view td {
  padding: 6px 12px;
  text-align: right;
  font-family: var(--font-mono);
  color: var(--text-primary);
}
.table-view th:first-child,
.table-view td:first-child {
  text-align: left;
}
.table-view thead th {
  position: sticky;
  top: 0;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.table-view tbody tr:not(:last-child) td {
  border-bottom: 1px solid var(--border-subtle);
}
</style>
