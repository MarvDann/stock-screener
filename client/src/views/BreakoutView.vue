<script setup lang="ts">
import { onMounted, ref, computed, watch } from "vue";
import { fetchBreakout } from "../api";
import type { BreakoutResponse } from "../types";
import CandidateCard from "../components/CandidateCard.vue";
import WarningsBanner from "../components/WarningsBanner.vue";
import Pagination from "../components/Pagination.vue";
import { usePagination } from "../composables/usePagination";
import { useQueryPage, useQueryParam } from "../composables/useQueryParam";
import { useStockCards } from "../composables/useStockCards";
import { useCachedResource } from "../composables/useCachedResource";
import { filterAndRank } from "../utils/search";

const { data, loading, error, load, updatedLabel } = useCachedResource<BreakoutResponse>("breakout", fetchBreakout);
// Tab, filter and page live in the URL so the back button and reloads restore them.
const search = useQueryParam("q");

const query = computed(() => search.value.trim().toLowerCase());

const triggered = computed(() =>
  filterAndRank(data.value?.triggered ?? [], query.value)
);

const approaching = computed(() =>
  filterAndRank(data.value?.approaching ?? [], query.value)
);

const CARDS_PER_PAGE = 6;
// One page number, for whichever tab is showing; switching tabs goes to page 1.
const page = useQueryPage();
const triggeredPager = usePagination(triggered, CARDS_PER_PAGE, page);
const approachingPager = usePagination(approaching, CARDS_PER_PAGE, page);

type Tab = "triggered" | "approaching";
const tabParam = useQueryParam("tab");
/** The tab in the URL, else whichever has results (Triggered when both do). */
const activeTab = computed<Tab>({
  get: () => {
    if (tabParam.value === "triggered" || tabParam.value === "approaching") return tabParam.value;
    return data.value && data.value.triggered.length === 0 ? "approaching" : "triggered";
  },
  set: (tab) => {
    tabParam.value = tab;
    page.value = 1;
  },
});
const activePager = computed(() => (activeTab.value === "triggered" ? triggeredPager : approachingPager));
const activePaged = computed(() => activePager.value.paged.value);

const {
  pageCards,
  loading: cardsLoading,
  error: cardsError,
  load: loadPageCards,
} = useStockCards(activePaged);

watch(search, () => (page.value = 1));

/** Refresh rescans and refetches the visible charts too. */
function refresh() {
  void loadPageCards({ force: true });
  void load({ force: true });
}

onMounted(() => load());
</script>

<template>
  <div>
    <div class="page-header">
      <h2>Breakout</h2>
      <div class="header-actions">
        <span v-if="updatedLabel" class="updated">{{ loading ? "Refreshing…" : updatedLabel }}</span>
        <input
          v-model="search"
          type="text"
          placeholder="Filter by symbol or name…"
          class="search"
        />
        <button class="btn-primary" :disabled="loading" @click="refresh">
          {{ loading ? "Refreshing…" : "Refresh" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-state">
      <p>Scan failed — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="refresh">Retry</button>
    </div>

    <p v-if="!data && loading" class="muted">Scanning…</p>

    <template v-if="data">
      <WarningsBanner :warnings="data.warnings" />

      <div class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="tab"
          :class="{ active: activeTab === 'triggered' }"
          :aria-selected="activeTab === 'triggered'"
          @click="activeTab = 'triggered'"
        >
          Triggered <span class="count">{{ triggered.length }}</span>
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          :class="{ active: activeTab === 'approaching' }"
          :aria-selected="activeTab === 'approaching'"
          @click="activeTab = 'approaching'"
        >
          Approaching <span class="count">{{ approaching.length }}</span>
        </button>
      </div>

      <section>
        <p v-if="activePager.paged.value.length === 0" class="empty">
          {{
            query
              ? "No matches."
              : activeTab === "triggered"
                ? "No triggered breakouts right now."
                : "No candidates approaching a breakout right now."
          }}
        </p>
        <template v-else>
          <Pagination
            :page="activePager.page.value"
            :total-pages="activePager.totalPages.value"
            @update:page="activePager.goTo"
          />
          <div v-if="cardsError" class="error-state">
            <p>Couldn't load charts for this page.</p>
            <p class="detail">{{ cardsError }}</p>
            <button @click="loadPageCards()">Retry</button>
          </div>
          <p v-if="cardsLoading && pageCards.length === 0" class="empty">Loading charts…</p>
          <div v-if="pageCards.length > 0" class="card-grid">
            <CandidateCard v-for="c in pageCards" :key="c.symbol" :candidate="c" />
          </div>
          <Pagination
            :page="activePager.page.value"
            :total-pages="activePager.totalPages.value"
            @update:page="activePager.goTo"
          />
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.search {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: var(--font-ui);
  width: 220px;
  outline: none;
  transition: border-color 0.15s;
}
.search::placeholder {
  color: var(--text-muted);
}
.search:focus {
  border-color: var(--accent);
}
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 20px;
}
.tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 600;
  padding: 8px 4px 10px;
  margin-bottom: -1px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: color 0.15s, border-color 0.15s;
}
.tab + .tab {
  margin-left: 16px;
}
.tab:hover {
  color: var(--text-primary);
}
.tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}
.tab .count {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.tab.active .count {
  color: var(--accent);
  border-color: var(--accent);
}
.updated {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.muted,
.empty {
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
