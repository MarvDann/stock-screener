<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchBreakout } from "../api";
import type { BreakoutResponse } from "../types";
import CandidateCard from "../components/CandidateCard.vue";
import WarningsBanner from "../components/WarningsBanner.vue";

const data = ref<BreakoutResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

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
      <button class="refresh" :disabled="loading" @click="load">
        {{ loading ? "Refreshing…" : "Refresh" }}
      </button>
    </div>

    <div v-if="error" class="error-state">
      <p>Scan failed — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load">Retry</button>
    </div>

    <template v-else-if="data">
      <WarningsBanner :warnings="data.warnings" />

      <section>
        <h3>Triggered ({{ data.triggered.length }})</h3>
        <p v-if="data.triggered.length === 0" class="empty">No triggered breakouts right now.</p>
        <div v-else class="grid">
          <CandidateCard v-for="c in data.triggered" :key="c.symbol" :candidate="c" />
        </div>
      </section>

      <section>
        <h3>Approaching ({{ data.approaching.length }})</h3>
        <p v-if="data.approaching.length === 0" class="empty">No candidates approaching a breakout right now.</p>
        <div v-else class="grid">
          <CandidateCard v-for="c in data.approaching" :key="c.symbol" :candidate="c" />
        </div>
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
