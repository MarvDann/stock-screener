<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchTickers } from "../api";
import type { Ticker } from "../types";
import CandidateCard from "../components/CandidateCard.vue";
import WarningsBanner from "../components/WarningsBanner.vue";
import Pagination from "../components/Pagination.vue";
import { usePagination } from "../composables/usePagination";
import { useQueryPage, useQueryParam, useUrlSearch } from "../composables/useQueryParam";
import { useStockCards } from "../composables/useStockCards";
import { filterAndRank } from "../utils/search";
import { UNCATEGORIZED, sectorOf } from "../utils/sectors";

const CARDS_PER_PAGE = 6;

const tickers = ref<Ticker[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

// Filters live in the URL so the back button and reloads restore them.
const { input: search, query } = useUrlSearch();
/** "" means all sectors. */
const sector = useQueryParam("sector");

/** Alphabetical, with Uncategorized last, each with its stock count. */
const sectorOptions = computed(() => {
  const counts = new Map<string, number>();
  for (const t of tickers.value) counts.set(sectorOf(t), (counts.get(sectorOf(t)) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => Number(a.name === UNCATEGORIZED) - Number(b.name === UNCATEGORIZED) || a.name.localeCompare(b.name));
});

const inSector = computed(() =>
  sector.value ? tickers.value.filter((t) => sectorOf(t) === sector.value) : tickers.value
);
const results = computed(() => filterAndRank(inSector.value, query.value));
const pager = usePagination(results, CARDS_PER_PAGE, useQueryPage());
watch([query, sector], pager.reset);

const { pageCards, loading: cardsLoading, error: cardsError, warnings, load: loadPageCards } = useStockCards(pager.paged);

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

onMounted(load);
</script>

<template>
  <div>
    <div class="page-header">
      <h2>Stock Charts</h2>
      <div class="header-actions">
        <span v-if="tickers.length > 0" class="match-count">
          {{ results.length }} {{ results.length === 1 ? "match" : "matches" }}
        </span>
        <select v-model="sector" class="sector-select" aria-label="Filter by sector">
          <option value="">All sectors</option>
          <option v-for="s in sectorOptions" :key="s.name" :value="s.name">{{ s.name }} ({{ s.count }})</option>
        </select>
        <input
          v-model="search"
          type="search"
          placeholder="Search by symbol or name…"
          aria-label="Search stocks"
          class="search"
          autofocus
        />
      </div>
    </div>

    <div v-if="error" class="error-state">
      <p>Couldn't load tickers — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load">Retry</button>
    </div>

    <p v-else-if="loading" class="muted">Loading…</p>

    <template v-else>
      <WarningsBanner :warnings="warnings" />

      <p v-if="results.length === 0" class="muted">
        {{ query || sector ? "No tracked stocks match." : "No tickers yet — add some on the Tickers page." }}
      </p>

      <template v-else>
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
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.match-count {
  color: var(--text-secondary);
  font-size: 13px;
}
.search {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: var(--font-ui);
  width: 260px;
  outline: none;
  transition: border-color 0.15s;
}
.sector-select {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: var(--font-ui);
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}
.sector-select:focus {
  border-color: var(--accent);
}
.search::placeholder {
  color: var(--text-muted);
}
.search:focus {
  border-color: var(--accent);
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
