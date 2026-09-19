<script setup lang="ts">
import { onMounted, ref, computed, watch } from "vue";
import { fetchBreakout } from "../api";
import type { BreakoutResponse } from "../types";
import CandidateCard from "../components/CandidateCard.vue";
import WarningsBanner from "../components/WarningsBanner.vue";
import Pagination from "../components/Pagination.vue";
import { usePagination } from "../composables/usePagination";

const data = ref<BreakoutResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const search = ref("");

const query = computed(() => search.value.trim().toLowerCase());

function rankMatch(c: { symbol: string; name: string }, q: string): number {
  const sym = c.symbol.toLowerCase();
  const name = c.name.toLowerCase();
  if (sym === q) return 0;
  if (sym.startsWith(q)) return 1;
  if (name.startsWith(q)) return 2;
  if (sym.includes(q) || name.includes(q)) return 3;
  return -1;
}

function filterAndRank<T extends { symbol: string; name: string }>(items: T[], q: string): T[] {
  if (!q) return items;
  return items
    .map((c) => ({ c, rank: rankMatch(c, q) }))
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.c);
}

const triggered = computed(() =>
  filterAndRank(data.value?.triggered ?? [], query.value)
);

const approaching = computed(() =>
  filterAndRank(data.value?.approaching ?? [], query.value)
);

const triggeredPager = usePagination(triggered);
const approachingPager = usePagination(approaching);

watch([data, search], () => {
  triggeredPager.reset();
  approachingPager.reset();
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await fetchBreakout();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Scan failed";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-header">
      <h2>Breakout</h2>
      <div class="header-actions">
        <input
          v-model="search"
          type="text"
          placeholder="Filter by symbol or name…"
          class="search"
        />
        <button class="btn-primary" :disabled="loading" @click="load">
          {{ loading ? "Refreshing…" : "Refresh" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-state">
      <p>Scan failed — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load">Retry</button>
    </div>

    <template v-else-if="data">
      <WarningsBanner :warnings="data.warnings" />

      <section>
        <h3>Triggered ({{ triggered.length }})</h3>
        <p v-if="triggered.length === 0" class="empty">{{ query ? 'No matches.' : 'No triggered breakouts right now.' }}</p>
        <template v-else>
          <Pagination
            :page="triggeredPager.page.value"
            :total-pages="triggeredPager.totalPages.value"
            @update:page="triggeredPager.goTo"
          />
          <div class="grid">
            <CandidateCard v-for="c in triggeredPager.paged.value" :key="c.symbol" :candidate="c" />
          </div>
          <Pagination
            :page="triggeredPager.page.value"
            :total-pages="triggeredPager.totalPages.value"
            @update:page="triggeredPager.goTo"
          />
        </template>
      </section>

      <section>
        <h3>Approaching ({{ approaching.length }})</h3>
        <p v-if="approaching.length === 0" class="empty">{{ query ? 'No matches.' : 'No candidates approaching a breakout right now.' }}</p>
        <template v-else>
          <Pagination
            :page="approachingPager.page.value"
            :total-pages="approachingPager.totalPages.value"
            @update:page="approachingPager.goTo"
          />
          <div class="grid">
            <CandidateCard v-for="c in approachingPager.paged.value" :key="c.symbol" :candidate="c" />
          </div>
          <Pagination
            :page="approachingPager.page.value"
            :total-pages="approachingPager.totalPages.value"
            @update:page="approachingPager.goTo"
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
h3 {
  color: var(--text-primary);
  font-weight: 600;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}
.empty {
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
