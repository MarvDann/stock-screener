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

const triggered = computed(() => {
  const items = data.value?.triggered ?? [];
  if (!query.value) return items;
  return items.filter((c) =>
    c.symbol.toLowerCase().includes(query.value) || c.name.toLowerCase().includes(query.value)
  );
});

const approaching = computed(() => {
  const items = data.value?.approaching ?? [];
  if (!query.value) return items;
  return items.filter((c) =>
    c.symbol.toLowerCase().includes(query.value) || c.name.toLowerCase().includes(query.value)
  );
});

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
        <button class="refresh" :disabled="loading" @click="load">
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
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
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
h2 {
  color: var(--text-primary);
  letter-spacing: -0.01em;
}
h3 {
  color: var(--text-primary);
  font-weight: 600;
}
.refresh {
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.refresh:hover:not(:disabled) {
  background: var(--accent-hover);
}
.refresh:disabled {
  opacity: 0.6;
  cursor: default;
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
.error-state {
  background: var(--surface);
  border: 1px solid var(--negative);
  border-radius: 10px;
  padding: 20px;
  color: var(--text-primary);
}
.error-state .detail {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 6px 0 12px;
}
.error-state button {
  background: var(--negative);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
}
</style>
