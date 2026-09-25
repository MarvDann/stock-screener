<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { fetchEtfs, fetchOverview, fetchSectorRotation } from "../api";
import type { EtfsResponse, OverviewResponse, SectorRotationResponse, StockCard } from "../types";
import HeroArt from "../components/HeroArt.vue";
import Sparkline from "../components/Sparkline.vue";
import { useCachedResource } from "../composables/useCachedResource";
import { useStockCards } from "../composables/useStockCards";
import { formatPrice } from "../utils/format";

/** Benchmarks for the market pulse row, with the names people know them by. */
const INDICES = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq-100" },
  { symbol: "IWM", label: "Russell 2000" },
  { symbol: "DIA", label: "Dow Jones" },
  { symbol: "VWRP.L", label: "FTSE All-World" },
  { symbol: "ISF.L", label: "FTSE 100" },
];
const SPARKLINE_BARS = 60;
const ROTATION_EACH_SIDE = 3;

const overview = useCachedResource<OverviewResponse>("overview", fetchOverview);
const rotation = useCachedResource<SectorRotationResponse>("sector-rotation", fetchSectorRotation);
// The ETF list only changes with a deploy, so an hour is plenty.
const etfs = useCachedResource<EtfsResponse>("etfs", fetchEtfs, 60 * 60 * 1000);
const indexCards = useStockCards(ref(INDICES));

// ── Market pulse ──

function dayChangePct(card: StockCard): number | null {
  const [prev, last] = card.bars.slice(-2);
  return prev && last ? ((last.close - prev.close) / prev.close) * 100 : null;
}

const pulse = computed(() => {
  const bySymbol = new Map(indexCards.pageCards.value.map((c) => [c.symbol, c]));
  return INDICES.map((index) => {
    const card = bySymbol.get(index.symbol);
    return {
      ...index,
      card,
      price: card?.bars.at(-1)?.close ?? null,
      changePct: card ? dayChangePct(card) : null,
      closes: card ? card.bars.slice(-SPARKLINE_BARS).map((b) => b.close) : [],
    };
  });
});

// ── Hero ──

const breadth = computed(() => overview.data.value?.breadth ?? null);
const pctUp = computed(() => (breadth.value?.total ? breadth.value.advancers / breadth.value.total : null));

const headline = computed(() => {
  if (pctUp.value === null) return "Your market at a glance";
  if (pctUp.value >= 0.6) return "Broad gains across the market";
  if (pctUp.value <= 0.4) return "Broad selling across the market";
  return "A mixed session for stocks";
});

const sessionLabel = computed(() => {
  const asOf = overview.data.value?.asOf;
  if (!asOf) return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const date = new Date(`${asOf}T12:00:00`);
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isToday = asOf === localToday;
  const day = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return isToday ? `Today · ${day}` : `Last session · ${day}`;
});

const leader = computed(() => rotation.data.value?.results.find((r) => r.rank === 1) ?? null);
const spy = computed(() => pulse.value[0]);

// ── Sector rotation ──

const rotationSides = computed(() => {
  const results = [...(rotation.data.value?.results ?? [])].sort((a, b) => a.rank - b.rank);
  const maxAbs = Math.max(1e-9, ...results.map((r) => Math.abs(r.mansfieldRs)));
  const withWidth = (r: (typeof results)[number]) => ({ ...r, width: (Math.abs(r.mansfieldRs) / maxAbs) * 100 });
  return {
    leaders: results.slice(0, ROTATION_EACH_SIDE).map(withWidth),
    laggards: results.slice(-ROTATION_EACH_SIDE).map(withWidth),
  };
});

// ── Formatting ──

function signedPct(value: number, decimals = 2): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

function trendClass(value: number | null): string {
  if (value === null || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

function share(part: number, total: number): string {
  return total ? `${((part / total) * 100).toFixed(1)}%` : "0%";
}

// ── Loading ──

const refreshing = computed(() => overview.loading.value || rotation.loading.value || indexCards.refreshing.value);
const updatedLabel = computed(() => (refreshing.value ? "Refreshing…" : overview.updatedLabel.value));

function refresh() {
  void overview.load({ force: true });
  void rotation.load({ force: true });
  void indexCards.load({ force: true });
}

onMounted(() => {
  void overview.load();
  void rotation.load();
  void etfs.load();
});
</script>

<template>
  <div class="home">
    <!-- Hero -->
    <header class="hero">
      <HeroArt />
      <div class="hero-top">
        <p class="overline">{{ sessionLabel }}</p>
        <div class="hero-actions">
          <span v-if="updatedLabel" class="updated">{{ updatedLabel }}</span>
          <button class="btn-primary" :disabled="refreshing" @click="refresh">Refresh</button>
        </div>
      </div>
      <h1 class="headline">{{ headline }}</h1>
      <p class="summary">
        <template v-if="spy.changePct !== null">
          <span class="fact">S&amp;P 500 <b :class="trendClass(spy.changePct)">{{ signedPct(spy.changePct) }}</b></span>
        </template>
        <template v-if="breadth && breadth.total">
          <span class="fact"><b>{{ breadth.advancers }}</b> of {{ breadth.total }} stocks higher</span>
        </template>
        <template v-if="overview.data.value">
          <span class="fact"><b>{{ overview.data.value.breakouts.triggeredCount }}</b> breakouts triggered</span>
        </template>
        <template v-if="leader">
          <span class="fact"><b>{{ leader.sectorName }}</b> leads sector rotation</span>
        </template>
        <span v-if="!overview.data.value && overview.loading.value" class="fact muted">
          Scanning your tracked stocks — the first scan takes about a minute…
        </span>
      </p>
    </header>

    <!-- Market pulse -->
    <section class="pulse" aria-label="Market pulse">
      <RouterLink
        v-for="p in pulse"
        :key="p.symbol"
        :to="{ name: 'stock-detail', params: { symbol: p.symbol } }"
        class="tile"
      >
        <div class="tile-top">
          <span class="tile-label">{{ p.label }}</span>
          <span class="tile-symbol">{{ p.symbol }}</span>
        </div>
        <template v-if="p.card">
          <div class="tile-price">
            <span class="price">{{ p.price !== null ? formatPrice(p.price, p.card.currency) : "—" }}</span>
            <span v-if="p.changePct !== null" class="change" :class="trendClass(p.changePct)">
              {{ signedPct(p.changePct) }}
            </span>
          </div>
          <div class="tile-spark"><Sparkline :values="p.closes" /></div>
        </template>
        <template v-else>
          <div class="skeleton skeleton-price"></div>
          <div class="skeleton skeleton-spark"></div>
        </template>
      </RouterLink>
    </section>

    <!-- Breadth + rotation -->
    <section class="row">
      <div class="panel">
        <div class="panel-head">
          <h3>Market breadth</h3>
          <span v-if="breadth" class="panel-meta">{{ breadth.total }} stocks traded</span>
        </div>
        <template v-if="breadth && breadth.total">
          <div class="breadth-bar" role="img" :aria-label="`${breadth.advancers} up, ${breadth.decliners} down`">
            <span class="seg up" :style="{ width: share(breadth.advancers, breadth.total) }"></span>
            <span class="seg flat" :style="{ width: share(breadth.unchanged, breadth.total) }"></span>
            <span class="seg down" :style="{ width: share(breadth.decliners, breadth.total) }"></span>
          </div>
          <div class="breadth-legend">
            <span><b class="up">{{ breadth.advancers }}</b> advancing</span>
            <span v-if="breadth.unchanged"><b>{{ breadth.unchanged }}</b> unchanged</span>
            <span><b class="down">{{ breadth.decliners }}</b> declining</span>
          </div>
          <div class="meter">
            <div class="meter-head">
              <span>Above 50-day SMA</span>
              <b>{{ share(breadth.aboveSma50, breadth.total) }}</b>
            </div>
            <div class="meter-track">
              <span class="meter-fill" :style="{ width: share(breadth.aboveSma50, breadth.total) }"></span>
            </div>
          </div>
        </template>
        <div v-else-if="overview.error.value && !overview.data.value" class="panel-error">
          {{ overview.error.value }} <button class="link-btn" @click="overview.load({ force: true })">Retry</button>
        </div>
        <div v-else class="skeleton-stack">
          <div class="skeleton skeleton-bar"></div>
          <div class="skeleton skeleton-line"></div>
          <div class="skeleton skeleton-bar"></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>Sector rotation</h3>
          <RouterLink to="/sector-rotation" class="panel-link">Full ranking →</RouterLink>
        </div>
        <template v-if="rotation.data.value">
          <p class="side-label">Leading</p>
          <div v-for="r in rotationSides.leaders" :key="r.sectorSymbol" class="rs-row">
            <span class="rs-name">{{ r.sectorName }}</span>
            <span class="rs-track"><span class="rs-fill" :class="trendClass(r.mansfieldRs)" :style="{ width: `${r.width}%` }"></span></span>
            <span class="rs-value" :class="trendClass(r.mansfieldRs)">{{ r.mansfieldRs.toFixed(2) }}</span>
          </div>
          <p class="side-label">Lagging</p>
          <div v-for="r in rotationSides.laggards" :key="r.sectorSymbol" class="rs-row">
            <span class="rs-name">{{ r.sectorName }}</span>
            <span class="rs-track"><span class="rs-fill" :class="trendClass(r.mansfieldRs)" :style="{ width: `${r.width}%` }"></span></span>
            <span class="rs-value" :class="trendClass(r.mansfieldRs)">{{ r.mansfieldRs.toFixed(2) }}</span>
          </div>
        </template>
        <div v-else-if="rotation.error.value" class="panel-error">
          {{ rotation.error.value }} <button class="link-btn" @click="rotation.load({ force: true })">Retry</button>
        </div>
        <div v-else class="skeleton-stack">
          <div v-for="i in 6" :key="i" class="skeleton skeleton-line"></div>
        </div>
      </div>
    </section>

    <!-- Movers + breakouts -->
    <section class="row">
      <div class="panel">
        <div class="panel-head">
          <h3>Top movers</h3>
          <RouterLink to="/stock-charts" class="panel-link">All stocks →</RouterLink>
        </div>
        <div v-if="overview.data.value" class="movers">
          <div v-for="side in (['gainers', 'losers'] as const)" :key="side" class="movers-col">
            <p class="side-label">{{ side === "gainers" ? "Gainers" : "Losers" }}</p>
            <p v-if="overview.data.value[side].length === 0" class="muted small">None today.</p>
            <RouterLink
              v-for="m in overview.data.value[side]"
              :key="m.symbol"
              :to="{ name: 'stock-detail', params: { symbol: m.symbol } }"
              class="mover"
            >
              <span class="mover-id">
                <span class="mover-symbol">{{ m.symbol }}</span>
                <span class="mover-name">{{ m.name }}</span>
              </span>
              <span class="mover-price">{{ formatPrice(m.close, m.currency) }}</span>
              <span class="pill" :class="trendClass(m.changePct)">{{ signedPct(m.changePct, 1) }}</span>
            </RouterLink>
          </div>
        </div>
        <div v-else-if="overview.error.value" class="panel-error">
          {{ overview.error.value }} <button class="link-btn" @click="overview.load({ force: true })">Retry</button>
        </div>
        <div v-else class="skeleton-stack">
          <div v-for="i in 5" :key="i" class="skeleton skeleton-line"></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>Breakouts</h3>
          <RouterLink to="/breakout" class="panel-link">Open Breakout →</RouterLink>
        </div>
        <template v-if="overview.data.value">
          <div class="stat-pair">
            <div class="stat">
              <span class="stat-num up">{{ overview.data.value.breakouts.triggeredCount }}</span>
              <span class="stat-label">Triggered</span>
            </div>
            <div class="stat">
              <span class="stat-num accent">{{ overview.data.value.breakouts.approachingCount }}</span>
              <span class="stat-label">Approaching</span>
            </div>
          </div>
          <p v-if="overview.data.value.breakouts.top.length === 0" class="muted small">
            Nothing has triggered right now — check the approaching list for setups.
          </p>
          <RouterLink
            v-for="b in overview.data.value.breakouts.top"
            :key="b.symbol"
            :to="{ name: 'stock-detail', params: { symbol: b.symbol } }"
            class="mover"
          >
            <span class="mover-id">
              <span class="mover-symbol">{{ b.symbol }}</span>
              <span class="mover-name">{{ b.name }}</span>
            </span>
            <span class="mover-price">{{ formatPrice(b.details.close, b.currency) }}</span>
            <span class="pill up">{{ b.details.volumeRatio.toFixed(1) }}× vol</span>
          </RouterLink>
        </template>
        <div v-else-if="overview.error.value" class="panel-error">
          {{ overview.error.value }} <button class="link-btn" @click="overview.load({ force: true })">Retry</button>
        </div>
        <div v-else class="skeleton-stack">
          <div class="skeleton skeleton-bar"></div>
          <div v-for="i in 4" :key="i" class="skeleton skeleton-line"></div>
        </div>
      </div>
    </section>

    <!-- Explore -->
    <section class="explore" aria-label="Explore">
      <RouterLink to="/stock-charts" class="explore-tile">
        <span class="explore-title">Stock Charts</span>
        <span class="explore-desc">
          {{ overview.data.value ? `${overview.data.value.tracked} stocks` : "Every tracked stock" }} — search, filter by sector, chart.
        </span>
      </RouterLink>
      <RouterLink to="/etfs" class="explore-tile">
        <span class="explore-title">ETFs</span>
        <span class="explore-desc">
          {{ etfs.data.value ? `${etfs.data.value.etfs.length} funds` : "Popular funds" }} across global, sector, bond and thematic.
        </span>
      </RouterLink>
      <RouterLink to="/sector-drilldown" class="explore-tile">
        <span class="explore-title">Sector Drilldown</span>
        <span class="explore-desc">From sector to sub-sector to the charts inside it.</span>
      </RouterLink>
    </section>
  </div>
</template>

<style scoped>
.home {
  max-width: 1240px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Hero ── */
.hero {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px 28px 30px;
  min-height: 190px;
  background:
    radial-gradient(900px 260px at 0% 0%, rgba(76, 141, 255, 0.16), transparent 65%),
    radial-gradient(600px 200px at 100% 100%, rgba(23, 201, 100, 0.08), transparent 70%),
    var(--bg-elevated);
}
/* Hero content sits above the background artwork. */
.hero-top,
.headline,
.summary {
  position: relative;
}
.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.overline {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}
.hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.updated {
  font-size: 12px;
  color: var(--text-secondary);
}
.headline {
  margin: 10px 0 12px;
  font-size: clamp(26px, 3.2vw, 38px);
  font-weight: 650;
  letter-spacing: -0.025em;
  line-height: 1.1;
  color: var(--text-primary);
}
.summary {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.fact {
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 12px;
}
.fact b {
  color: var(--text-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.fact.muted {
  border-style: dashed;
}

/* ── Trend colours ── */
.up {
  color: var(--positive) !important;
}
.down {
  color: var(--negative) !important;
}
.accent {
  color: var(--accent);
}

/* ── Market pulse ── */
.pulse {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px 10px;
  text-decoration: none;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.tile:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}
.tile-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.tile-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.tile-symbol {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
.tile-price {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.price {
  font-family: var(--font-mono);
  font-size: 17px;
  font-weight: 500;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.change {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
}
.change.flat {
  color: var(--text-secondary);
}
.tile-spark {
  height: 38px;
}

/* ── Panels ── */
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 1000px) {
  .row {
    grid-template-columns: 1fr;
  }
}
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px 18px;
  min-width: 0;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 14px;
}
.panel-head h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.panel-meta {
  font-size: 12px;
  color: var(--text-muted);
}
.panel-link {
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
}
.panel-link:hover {
  text-decoration: underline;
}
.panel-error {
  font-size: 13px;
  color: var(--negative);
}
.link-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-family: var(--font-ui);
  font-size: 13px;
  cursor: pointer;
  padding: 0 0 0 6px;
}
.side-label {
  margin: 12px 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.side-label:first-child,
.movers-col .side-label {
  margin-top: 0;
}
.muted {
  color: var(--text-secondary);
}
.small {
  font-size: 13px;
}

/* ── Breadth ── */
.breadth-bar {
  display: flex;
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--border-subtle);
  gap: 2px;
}
.seg {
  display: block;
  height: 100%;
  transition: width 0.4s ease;
}
.seg.up {
  background: var(--positive);
}
.seg.down {
  background: var(--negative);
}
.seg.flat {
  background: var(--text-muted);
}
.breadth-legend {
  display: flex;
  gap: 16px;
  margin: 10px 0 18px;
  font-size: 13px;
  color: var(--text-secondary);
}
.breadth-legend b {
  font-family: var(--font-mono);
  color: var(--text-primary);
}
.meter-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.meter-head b {
  font-family: var(--font-mono);
  color: var(--text-primary);
}
.meter-track {
  height: 8px;
  border-radius: 999px;
  background: var(--border-subtle);
  overflow: hidden;
}
.meter-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.4s ease;
}

/* ── Rotation ── */
.rs-row {
  display: grid;
  grid-template-columns: minmax(110px, 1.2fr) 2fr 52px;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  font-size: 13px;
}
.rs-name {
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rs-track {
  height: 6px;
  border-radius: 999px;
  background: var(--border-subtle);
  overflow: hidden;
}
.rs-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
}
.rs-fill.up {
  background: var(--positive);
}
.rs-fill.down {
  background: var(--negative);
}
.rs-fill.flat {
  background: var(--text-muted);
}
.rs-value {
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: right;
}

/* ── Movers & breakouts ── */
.movers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
@media (max-width: 560px) {
  .movers {
    grid-template-columns: 1fr;
  }
}
.movers-col {
  min-width: 0;
}
.mover {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  margin: 0 -8px;
  border-radius: 8px;
  text-decoration: none;
  transition: background-color 0.12s ease;
}
.mover:hover {
  background: var(--surface-hover);
}
.mover-id {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.mover-symbol {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.mover-name {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mover-price {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.pill {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  min-width: 56px;
  text-align: center;
}
.pill.up {
  background: var(--positive-soft);
}
.pill.down {
  background: var(--negative-soft);
}
.stat-pair {
  display: flex;
  gap: 28px;
  margin-bottom: 12px;
}
.stat {
  display: flex;
  flex-direction: column;
}
.stat-num {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 600;
  line-height: 1.1;
}
.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ── Explore ── */
.explore {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.explore-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: linear-gradient(135deg, var(--surface), var(--bg-elevated));
  text-decoration: none;
  transition: border-color 0.15s ease;
}
.explore-tile:hover {
  border-color: var(--accent);
}
.explore-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.explore-title::after {
  content: " →";
  color: var(--accent);
}
.explore-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

/* ── Skeletons ── */
.skeleton {
  border-radius: 6px;
  background: linear-gradient(90deg, var(--surface-hover) 0%, var(--border) 50%, var(--surface-hover) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
.skeleton-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.skeleton-price {
  height: 20px;
  width: 70%;
}
.skeleton-spark {
  height: 38px;
}
.skeleton-bar {
  height: 14px;
}
.skeleton-line {
  height: 22px;
}
@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
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
