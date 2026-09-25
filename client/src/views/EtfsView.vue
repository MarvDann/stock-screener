<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchEtfs } from "../api";
import type { Etf } from "../types";
import CandidateCard from "../components/CandidateCard.vue";
import WarningsBanner from "../components/WarningsBanner.vue";
import Pagination from "../components/Pagination.vue";
import { usePagination } from "../composables/usePagination";
import { useQueryPage, useQueryParam, useUrlSearch } from "../composables/useQueryParam";
import { useStockCards } from "../composables/useStockCards";
import { filterAndRank } from "../utils/search";

const CARDS_PER_PAGE = 6;

const etfs = ref<Etf[]>([]);
const categories = ref<string[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

// Filters live in the URL so the back button and reloads restore them.
/** "" means every category. */
const category = useQueryParam("category");
const { input: search, query } = useUrlSearch();

const categoryCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const e of etfs.value) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  return counts;
});

const inCategory = computed(() =>
  category.value ? etfs.value.filter((e) => e.category === category.value) : etfs.value
);
const results = computed(() => filterAndRank(inCategory.value, query.value));
const pager = usePagination(results, CARDS_PER_PAGE, useQueryPage());
watch([query, category], pager.reset);

const { pageCards, loading: cardsLoading, error: cardsError, warnings, load: loadPageCards } = useStockCards(pager.paged);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const response = await fetchEtfs();
    etfs.value = response.etfs;
    categories.value = response.categories;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load ETFs";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-header">
      <h2>ETFs</h2>
      <div class="header-actions">
        <span v-if="etfs.length > 0" class="match-count">
          {{ results.length }} {{ results.length === 1 ? "match" : "matches" }}
        </span>
        <input
          v-model="search"
          type="search"
          placeholder="Search by symbol or name…"
          aria-label="Search ETFs"
          class="search"
        />
      </div>
    </div>

    <div v-if="error" class="error-state">
      <p>Couldn't load ETFs — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load">Retry</button>
    </div>

    <p v-else-if="loading" class="muted">Loading…</p>

    <template v-else>
      <div class="chips" role="group" aria-label="Filter by category">
        <button type="button" class="chip" :class="{ active: category === '' }" @click="category = ''">
          All <span class="chip-count">{{ etfs.length }}</span>
        </button>
        <button
          v-for="c in categories"
          :key="c"
          type="button"
          class="chip"
          :class="{ active: category === c }"
          @click="category = c"
        >
          {{ c }} <span class="chip-count">{{ categoryCounts.get(c) ?? 0 }}</span>
        </button>
      </div>

      <WarningsBanner :warnings="warnings" />

      <p v-if="results.length === 0" class="muted">No ETFs match.</p>

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
.search::placeholder {
  color: var(--text-muted);
}
.search:focus {
  border-color: var(--accent);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 20px;
}
.chip {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: color 0.15s, border-color 0.15s;
}
.chip:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}
.chip.active {
  color: var(--accent);
  border-color: var(--accent);
}
.chip-count {
  color: var(--text-muted);
  font-weight: 500;
}
.chip.active .chip-count {
  color: var(--accent);
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
