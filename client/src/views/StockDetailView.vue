<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { fetchStockDetail } from "../api";
import type { StockDetail } from "../types";
import PriceChart from "../components/PriceChart.vue";
import EpsChart from "../components/EpsChart.vue";
import { formatAbbreviatedCurrency, formatPercent, formatPrice, formatRatio, formatTimeAgo } from "../utils/format";

const route = useRoute();
const router = useRouter();
const symbol = route.params.symbol as string;
const data = ref<StockDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await fetchStockDetail(symbol);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load stock data";
  } finally {
    loading.value = false;
  }
}

/** Latest close — from the screen when the stock qualifies, otherwise the last bar. */
const lastClose = computed(() => data.value?.details?.close ?? data.value?.bars.at(-1)?.close ?? null);

/** Business summaries longer than this start collapsed. */
const SUMMARY_PREVIEW_CHARS = 320;
const summaryExpanded = ref(false);
const summaryIsLong = computed(() => (data.value?.profile?.summary?.length ?? 0) > SUMMARY_PREVIEW_CHARS);

/** The profile's one-line facts, skipping any Yahoo doesn't have. */
const profileFacts = computed(() => {
  const p = data.value?.profile;
  if (!p) return [];
  const facts: { label: string; value: string }[] = [
    { label: "Sector", value: p.sector ?? "" },
    { label: "Industry", value: p.industry ?? "" },
    { label: "Headquarters", value: p.headquarters ?? "" },
    { label: "Employees", value: p.employees != null ? p.employees.toLocaleString("en-US") : "" },
  ];
  return facts.filter((f) => f.value);
});

/** Only http(s) links are rendered, shown as the bare host, e.g. "apple.com". */
const website = computed(() => {
  const url = data.value?.profile?.website;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return { href: parsed.href, host: parsed.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
});

function formatNumber(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

/**
 * Where the back button goes: the page you came from — filters, sector and
 * all — when it's a titled page, otherwise Home (e.g. opened from a link).
 */
const backTarget = (() => {
  const previous = router.options.history.state.back;
  if (typeof previous === "string") {
    const title = router.resolve(previous).meta.title;
    if (typeof title === "string") return { title, inHistory: true };
  }
  return { title: "Home", inHistory: false };
})();

function back() {
  if (backTarget.inHistory) router.back();
  else router.push("/");
}

onMounted(load);
</script>

<template>
  <div>
    <div class="detail-header">
      <button class="back-btn" @click="back">&larr; {{ backTarget.title }}</button>
      <div class="title-group">
        <h2>{{ data?.name || symbol }}</h2>
        <span class="ticker-badge">{{ symbol }}</span>
      </div>
      <span v-if="data && lastClose != null" class="price">{{ formatPrice(lastClose, data.currency) }}</span>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <div v-if="error" class="error-state">
      <p>Failed to load data for {{ symbol }}.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load">Retry</button>
    </div>

    <template v-if="data">
      <div class="chart-container">
        <PriceChart
          :bars="data.bars"
          :sma50-series="data.sma50Series"
          :sma150-series="data.sma150Series"
          :height="500"
        />
      </div>

      <div class="legend">
        <span class="legend-item"><span class="swatch swatch-sma50"></span>50-day SMA</span>
        <span class="legend-item"><span class="swatch swatch-sma150"></span>150-day SMA</span>
      </div>

      <div v-if="data.details || data.financials || data.epsHistory.length > 0" class="stats-grid">
        <template v-if="data.details">
          <div class="stat-card">
            <span class="stat-label">Close</span>
            <span class="stat-value">{{ formatPrice(data.details.close, data.currency) }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">50-day SMA</span>
            <span class="stat-value">{{ formatPrice(data.details.sma50, data.currency) }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">% vs 50-SMA</span>
            <span class="stat-value" :class="data.details.pctBelowSma50 > 0 ? 'neg' : 'pos'">
              {{ formatNumber(data.details.pctBelowSma50) }}%
            </span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Volume Ratio</span>
            <span class="stat-value">{{ formatNumber(data.details.volumeRatio, 1) }}x</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Range Contraction</span>
            <span class="stat-value">{{ formatNumber(data.details.rangeContractionPct, 1) }}%</span>
          </div>
        </template>
        <div v-if="data.financials" class="stat-card">
          <span class="stat-label">Gross Margin</span>
          <span class="stat-value">{{ formatPercent(data.financials.grossMargin) }}</span>
        </div>
        <div v-if="data.financials" class="stat-card">
          <span class="stat-label">Operating Margin</span>
          <span class="stat-value">{{ formatPercent(data.financials.operatingMargin) }}</span>
        </div>
        <div v-if="data.financials" class="stat-card">
          <span class="stat-label">Free Cash Flow</span>
          <span class="stat-value">{{ formatAbbreviatedCurrency(data.financials.freeCashflow, data.financials.financialCurrency ?? "USD") }}</span>
        </div>
        <div v-if="data.financials" class="stat-card">
          <span class="stat-label">Debt / Equity</span>
          <span class="stat-value">{{ formatRatio(data.financials.debtToEquity) }}</span>
        </div>
        <div v-if="data.financials" class="stat-card">
          <span class="stat-label">Trailing P/E Ratio</span>
          <span class="stat-value">{{ formatRatio(data.financials.trailingPE) }}</span>
        </div>
        <div v-if="data.epsHistory.length > 0" class="stat-card eps-card">
          <span class="stat-label">EPS (Trailing 4 Quarters)</span>
          <EpsChart :values="data.epsHistory" />
        </div>
      </div>

      <div v-if="data.profile || data.news.length > 0" class="overview">
        <section v-if="data.profile" class="panel about">
          <h3 class="panel-title">About</h3>
          <dl v-if="profileFacts.length > 0 || website" class="facts">
            <div v-for="fact in profileFacts" :key="fact.label" class="fact">
              <dt>{{ fact.label }}</dt>
              <dd>{{ fact.value }}</dd>
            </div>
            <div v-if="website" class="fact">
              <dt>Website</dt>
              <dd><a :href="website.href" target="_blank" rel="noopener noreferrer">{{ website.host }}</a></dd>
            </div>
          </dl>
          <p v-if="data.profile.summary" class="summary" :class="{ clamped: summaryIsLong && !summaryExpanded }">
            {{ data.profile.summary }}
          </p>
          <button v-if="summaryIsLong" class="more-btn" @click="summaryExpanded = !summaryExpanded">
            {{ summaryExpanded ? "Show less" : "Show more" }}
          </button>
        </section>

        <section v-if="data.news.length > 0" class="panel news">
          <h3 class="panel-title">Recent News</h3>
          <ul class="news-list">
            <li v-for="item in data.news" :key="item.link" class="news-item">
              <a :href="item.link" target="_blank" rel="noopener noreferrer" class="news-title">{{ item.title }}</a>
              <span class="news-meta">{{ item.publisher }} · {{ formatTimeAgo(item.publishedAt) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}
.back-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: var(--font-ui);
  padding: 6px 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.back-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}
.title-group {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex: 1;
}
.title-group h2 {
  margin: 0;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}
.ticker-badge {
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-mono);
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
  letter-spacing: 0.04em;
}
.price {
  font-size: 20px;
  font-weight: 600;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
.loading {
  color: var(--text-secondary);
  font-size: 14px;
  padding: 40px 0;
}
.chart-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  height: 532px;
}
.legend {
  display: flex;
  gap: 16px;
  margin: 10px 0 20px;
  font-size: 12px;
  color: var(--text-secondary);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.swatch {
  display: inline-block;
  width: 14px;
  height: 3px;
  border-radius: 1px;
}
.swatch-sma50 {
  background: #facc15;
}
.swatch-sma150 {
  background: #a78bfa;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.eps-card {
  min-height: 90px;
}
.eps-card .eps-chart,
.eps-card .eps-empty {
  flex: 1;
}
.stat-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.stat-value {
  font-size: 18px;
  font-weight: 600;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
.stat-value.pos {
  color: var(--positive);
}
.stat-value.neg {
  color: var(--negative);
}
.overview {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 12px;
  margin-top: 20px;
}
.overview > .panel:only-child {
  grid-column: 1 / -1;
}
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 18px;
  min-width: 0;
}
.panel-title {
  margin: 0 0 12px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px 16px;
  margin: 0 0 14px;
}
.fact dt {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 2px;
}
.fact dd {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
}
.fact a,
.news-title {
  color: var(--text-primary);
  text-decoration: none;
}
.fact a {
  color: var(--accent);
}
.fact a:hover,
.news-title:hover {
  color: var(--accent-hover);
}
.summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.summary.clamped {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.more-btn {
  margin-top: 6px;
  padding: 0;
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  font-family: var(--font-ui);
  cursor: pointer;
}
.more-btn:hover {
  color: var(--accent-hover);
}
.news-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.news-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 0;
  border-top: 1px solid var(--border-subtle);
}
.news-item:first-child {
  padding-top: 0;
  border-top: none;
}
.news-item:last-child {
  padding-bottom: 0;
}
.news-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}
.news-meta {
  font-size: 11px;
  color: var(--text-muted);
}
@media (max-width: 760px) {
  .overview {
    grid-template-columns: 1fr;
  }
}
</style>
