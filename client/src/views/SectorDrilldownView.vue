<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchSectorStats, fetchTickers } from "../api";
import type { GroupStats, SectorStatsResponse, Ticker } from "../types";
import CandidateCard from "../components/CandidateCard.vue";
import Sparkline from "../components/Sparkline.vue";
import WarningsBanner from "../components/WarningsBanner.vue";
import Pagination from "../components/Pagination.vue";
import { useCachedResource } from "../composables/useCachedResource";
import { usePagination } from "../composables/usePagination";
import { useQueryPage } from "../composables/useQueryParam";
import { useStockCards } from "../composables/useStockCards";
import { UNCATEGORIZED, industryOf, sectorMeta, sectorOf } from "../utils/sectors";

const CARDS_PER_PAGE = 6;
const SPARKLINE_BARS = 60;
const SYMBOL_CHIPS = 6;

interface Group {
  name: string;
  tickers: Ticker[];
}

const route = useRoute();
const tickers = ref<Ticker[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const selectedSector = computed(() => (typeof route.query.sector === "string" ? route.query.sector : null));
const selectedIndustry = computed(() => (typeof route.query.industry === "string" ? route.query.industry : null));

/** Largest groups first, with Uncategorized always last. */
function groupBy(items: Ticker[], key: (t: Ticker) => string): Group[] {
  const groups = new Map<string, Ticker[]>();
  for (const t of items) groups.set(key(t), [...(groups.get(key(t)) ?? []), t]);
  return [...groups]
    .map(([name, tickers]) => ({ name, tickers }))
    .sort(
      (a, b) =>
        Number(a.name === UNCATEGORIZED) - Number(b.name === UNCATEGORIZED) ||
        b.tickers.length - a.tickers.length ||
        a.name.localeCompare(b.name)
    );
}

// ── Latest-day stats; cards render straight away and these fill in once the scan is ready ──

const stats = useCachedResource<SectorStatsResponse>("sector-stats", fetchSectorStats);
const sectorStats = computed(
  () => new Map<string, GroupStats>((stats.data.value?.sectors ?? []).map((s) => [s.sector || UNCATEGORIZED, s]))
);
const industryStats = computed(
  () =>
    new Map<string, GroupStats>(
      (stats.data.value?.industries ?? []).map((s) => [`${s.sector || UNCATEGORIZED}|${s.industry || UNCATEGORIZED}`, s])
    )
);

/** Tickers the server hasn't looked up yet; they show as Uncategorized until it does. */
const pendingCount = computed(() => tickers.value.filter((t) => t.sector === null).length);

const sectors = computed(() =>
  groupBy(tickers.value, sectorOf).map((g) => ({
    ...g,
    meta: sectorMeta(g.name),
    subGroupCount: new Set(g.tickers.map(industryOf)).size,
    stats: sectorStats.value.get(g.name),
  }))
);

const sectorTickers = computed(() => tickers.value.filter((t) => sectorOf(t) === selectedSector.value));
const selectedMeta = computed(() => sectorMeta(selectedSector.value ?? ""));
const industries = computed(() =>
  groupBy(sectorTickers.value, industryOf).map((g) => ({
    ...g,
    stats: industryStats.value.get(`${selectedSector.value}|${g.name}`),
  }))
);

const industryTickers = computed(() => sectorTickers.value.filter((t) => industryOf(t) === selectedIndustry.value));
// The sector links replace the whole query, so moving between levels starts back on page 1.
const pager = usePagination(industryTickers, CARDS_PER_PAGE, useQueryPage());
const { pageCards, loading: cardsLoading, error: cardsError, warnings, load: loadPageCards } = useStockCards(pager.paged);

/** Stats for the sector or sub-sector the banner describes. */
const bannerStats = computed(() =>
  selectedIndustry.value
    ? industryStats.value.get(`${selectedSector.value}|${selectedIndustry.value}`)
    : sectorStats.value.get(selectedSector.value ?? "")
);

// ── Sector ETF trend lines, for the sector cards and the sector banner ──

const etfSymbols = computed(() => {
  const names = selectedSector.value ? [selectedSector.value] : sectors.value.map((s) => s.name);
  return names
    .map((n) => sectorMeta(n).etf)
    .filter((etf): etf is string => etf !== null)
    .map((symbol) => ({ symbol }));
});
const etfCards = useStockCards(etfSymbols);
const etfCloses = computed(
  () => new Map(etfCards.pageCards.value.map((c) => [c.symbol, c.bars.slice(-SPARKLINE_BARS).map((b) => b.close)]))
);

// ── Formatting ──

function countLabel(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function signedPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function trendClass(value: number | null): string {
  if (value === null || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

function share(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)}%` : "0%";
}

/** Tinted badge background from a sector's accent colour. */
function badgeStyle(color: string) {
  return { color, background: `color-mix(in srgb, ${color} 16%, transparent)` };
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    tickers.value = await fetchTickers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load tickers";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
  void stats.load();
});
</script>

<template>
  <div>
    <div class="page-header">
      <h2>Sector Drilldown</h2>
      <span v-if="stats.data.value?.asOf" class="as-of">Moves as of {{ stats.data.value.asOf }}</span>
    </div>

    <div v-if="error" class="error-state">
      <p>Couldn't load tickers — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load">Retry</button>
    </div>

    <p v-else-if="loading" class="muted">Loading…</p>

    <template v-else>
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <RouterLink v-if="selectedSector" :to="{ query: {} }">All sectors</RouterLink>
        <span v-else>All sectors</span>
        <template v-if="selectedSector">
          <span class="sep">/</span>
          <RouterLink v-if="selectedIndustry" :to="{ query: { sector: selectedSector } }">{{ selectedSector }}</RouterLink>
          <span v-else>{{ selectedSector }}</span>
        </template>
        <template v-if="selectedSector && selectedIndustry">
          <span class="sep">/</span>
          <span>{{ selectedIndustry }}</span>
        </template>
      </nav>

      <p v-if="pendingCount > 0" class="muted pending">
        {{ countLabel(pendingCount, "ticker") }} still being categorized — refresh in a minute.
      </p>

      <!-- Level 1: sectors -->
      <template v-if="!selectedSector">
        <p v-if="sectors.length === 0" class="muted">No tickers yet — add some on the Tickers page.</p>
        <div v-else class="sector-grid">
          <RouterLink
            v-for="s in sectors"
            :key="s.name"
            :to="{ query: { sector: s.name } }"
            class="tile sector-tile"
            :style="{ '--sector': s.meta.color }"
          >
            <div class="tile-head">
              <span class="badge" :style="badgeStyle(s.meta.color)"><component :is="s.meta.icon" :size="22" /></span>
              <div class="tile-title">
                <span class="tile-name">{{ s.name }}</span>
                <span class="tile-meta">
                  {{ countLabel(s.tickers.length, "stock") }} · {{ countLabel(s.subGroupCount, "sub-sector") }}
                </span>
              </div>
              <span v-if="s.stats?.avgChangePct != null" class="move" :class="trendClass(s.stats.avgChangePct)">
                {{ signedPct(s.stats.avgChangePct) }}
              </span>
            </div>

            <div v-if="s.meta.etf" class="tile-spark">
              <span class="spark-label">{{ s.meta.etf }} · 60 days</span>
              <div class="spark-box">
                <Sparkline v-if="etfCloses.get(s.meta.etf)" :values="etfCloses.get(s.meta.etf)!" />
              </div>
            </div>

            <div v-if="s.stats" class="tile-stats">
              <div class="mini-breadth" role="img" :aria-label="`${s.stats.advancers} up, ${s.stats.decliners} down`">
                <span class="seg up" :style="{ width: share(s.stats.advancers, s.stats.total) }"></span>
                <span class="seg down" :style="{ width: share(s.stats.decliners, s.stats.total) }"></span>
              </div>
              <div class="stat-line">
                <span><b class="up">{{ s.stats.advancers }}</b> up · <b class="down">{{ s.stats.decliners }}</b> down</span>
                <span><b>{{ share(s.stats.aboveSma50, s.stats.total) }}</b> above 50-day</span>
              </div>
            </div>
            <div v-else class="tile-stats"><div class="skeleton"></div></div>
          </RouterLink>
        </div>
      </template>

      <template v-else>
        <!-- Sector banner, on the sub-sector and stock levels -->
        <section class="sector-banner" :style="{ '--sector': selectedMeta.color }">
          <span class="badge badge-lg" :style="badgeStyle(selectedMeta.color)">
            <component :is="selectedMeta.icon" :size="30" />
          </span>
          <div class="banner-body">
            <h3>{{ selectedIndustry ?? selectedSector }}</h3>
            <p class="banner-meta">
              <template v-if="selectedIndustry">{{ selectedSector }} · {{ countLabel(industryTickers.length, "stock") }}</template>
              <template v-else>
                {{ countLabel(sectorTickers.length, "stock") }} · {{ countLabel(industries.length, "sub-sector") }}
              </template>
            </p>
            <div v-if="bannerStats" class="banner-stats">
              <span v-if="bannerStats.avgChangePct != null" class="move" :class="trendClass(bannerStats.avgChangePct)">
                {{ signedPct(bannerStats.avgChangePct) }} avg today
              </span>
              <span><b class="up">{{ bannerStats.advancers }}</b> up · <b class="down">{{ bannerStats.decliners }}</b> down</span>
              <span><b>{{ share(bannerStats.aboveSma50, bannerStats.total) }}</b> above 50-day SMA</span>
            </div>
          </div>
          <div v-if="!selectedIndustry && selectedMeta.etf" class="banner-etf">
            <div class="banner-spark">
              <Sparkline v-if="etfCloses.get(selectedMeta.etf)" :values="etfCloses.get(selectedMeta.etf)!" :width="240" :height="64" />
            </div>
            <RouterLink :to="{ name: 'stock-detail', params: { symbol: selectedMeta.etf } }" class="banner-link">
              {{ selectedMeta.etf }} sector ETF chart →
            </RouterLink>
          </div>
        </section>

        <!-- Level 2: sub-sectors of the chosen sector -->
        <template v-if="!selectedIndustry">
          <p v-if="industries.length === 0" class="muted">No tracked stocks in {{ selectedSector }}.</p>
          <div v-else class="industry-grid">
            <RouterLink
              v-for="i in industries"
              :key="i.name"
              :to="{ query: { sector: selectedSector, industry: i.name } }"
              class="tile industry-tile"
              :style="{ '--sector': selectedMeta.color }"
            >
              <div class="tile-head">
                <span class="badge badge-sm" :style="badgeStyle(selectedMeta.color)">
                  <component :is="selectedMeta.icon" :size="16" />
                </span>
                <div class="tile-title">
                  <span class="tile-name">{{ i.name }}</span>
                  <span class="tile-meta">{{ countLabel(i.tickers.length, "stock") }}</span>
                </div>
                <span v-if="i.stats?.avgChangePct != null" class="move" :class="trendClass(i.stats.avgChangePct)">
                  {{ signedPct(i.stats.avgChangePct) }}
                </span>
              </div>
              <div v-if="i.stats" class="mini-breadth" role="img" :aria-label="`${i.stats.advancers} up, ${i.stats.decliners} down`">
                <span class="seg up" :style="{ width: share(i.stats.advancers, i.stats.total) }"></span>
                <span class="seg down" :style="{ width: share(i.stats.decliners, i.stats.total) }"></span>
              </div>
              <div class="chips">
                <span v-for="t in i.tickers.slice(0, SYMBOL_CHIPS)" :key="t.symbol" class="chip">{{ t.symbol }}</span>
                <span v-if="i.tickers.length > SYMBOL_CHIPS" class="chip more">+{{ i.tickers.length - SYMBOL_CHIPS }}</span>
              </div>
            </RouterLink>
          </div>
        </template>

        <!-- Level 3: stocks in the chosen sub-sector -->
        <template v-else>
          <p v-if="industryTickers.length === 0" class="muted">No tracked stocks in {{ selectedIndustry }}.</p>
          <template v-else>
            <WarningsBanner :warnings="warnings" />
            <Pagination :page="pager.page.value" :total-pages="pager.totalPages.value" @update:page="pager.goTo" />

            <div v-if="cardsError" class="error-state">
              <p>Couldn't load charts for this page.</p>
              <p class="detail">{{ cardsError }}</p>
              <button @click="loadPageCards()">Retry</button>
            </div>
            <p v-if="cardsLoading && pageCards.length === 0" class="muted">Loading charts…</p>
            <div v-if="pageCards.length > 0" class="card-grid">
              <CandidateCard v-for="c in pageCards" :key="c.symbol" :candidate="c" show-state />
            </div>

            <Pagination :page="pager.page.value" :total-pages="pager.totalPages.value" @update:page="pager.goTo" />
          </template>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.as-of {
  font-size: 12px;
  color: var(--text-secondary);
}
.breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 16px;
}
.breadcrumb a {
  color: var(--accent);
  text-decoration: none;
}
.breadcrumb a:hover {
  text-decoration: underline;
}
.sep {
  color: var(--text-muted);
}
.pending {
  margin: -8px 0 16px;
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}

/* ── Shared tile pieces ── */
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
  text-decoration: none;
  overflow: hidden;
  transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}
.tile::before {
  /* A soft wash of the sector colour from the top-left corner. */
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(260px 120px at 0% 0%, color-mix(in srgb, var(--sector) 12%, transparent), transparent 70%);
  pointer-events: none;
}
.tile:hover {
  border-color: var(--sector);
  box-shadow: 0 0 0 1px var(--sector);
  transform: translateY(-2px);
}
.tile-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
}
.tile-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.tile-name {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tile-meta {
  color: var(--text-secondary);
  font-size: 12px;
}
.badge {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
}
.badge-sm {
  width: 30px;
  height: 30px;
  border-radius: 8px;
}
.badge-lg {
  width: 64px;
  height: 64px;
  border-radius: 16px;
}
.move {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.up {
  color: var(--positive);
}
.down {
  color: var(--negative);
}
.flat {
  color: var(--text-secondary);
}

/* ── Sector cards ── */
.sector-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: 14px;
}
.tile-spark {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.spark-label {
  align-self: flex-end;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
}
.spark-box {
  height: 52px;
}
.tile-stats {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mini-breadth {
  position: relative;
  display: flex;
  gap: 2px;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--border-subtle);
}
.seg {
  display: block;
  height: 100%;
}
.seg.up {
  background: var(--positive);
}
.seg.down {
  background: var(--negative);
}
.stat-line {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
}
.stat-line b,
.banner-stats b {
  font-family: var(--font-mono);
  color: var(--text-primary);
}
.stat-line b.up,
.banner-stats b.up {
  color: var(--positive);
}
.stat-line b.down,
.banner-stats b.down {
  color: var(--negative);
}
.skeleton {
  height: 26px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--surface-hover), var(--border), var(--surface-hover));
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

/* ── Sector banner ── */
.sector-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 20px 22px;
  margin-bottom: 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  background:
    radial-gradient(600px 180px at 0% 0%, color-mix(in srgb, var(--sector) 18%, transparent), transparent 70%),
    var(--bg-elevated);
}
.banner-body {
  flex: 1;
  min-width: 0;
}
.banner-body h3 {
  margin: 0;
  font-size: 22px;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}
.banner-meta {
  margin: 2px 0 10px;
  font-size: 13px;
  color: var(--text-secondary);
}
.banner-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}
.banner-etf {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  width: 240px;
}
.banner-spark {
  width: 100%;
  height: 64px;
}
.banner-link {
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
}
.banner-link:hover {
  text-decoration: underline;
}
@media (max-width: 760px) {
  .sector-banner {
    flex-wrap: wrap;
  }
  .banner-etf {
    width: 100%;
    align-items: stretch;
  }
}

/* ── Sub-sector cards ── */
.industry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
  gap: 12px;
}
.industry-tile {
  gap: 10px;
  padding: 14px;
}
.industry-tile .tile-name {
  font-size: 14px;
  line-height: 1.25;
  /* Long sub-sector names wrap to a second line rather than being cut off. */
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.chips {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 2px 6px;
}
.chip.more {
  color: var(--text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
  .tile:hover {
    transform: none;
  }
}
</style>
