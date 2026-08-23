<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchSectorRotation } from "../api";
import type { SectorRotationResponse } from "../types";
import WarningsBanner from "../components/WarningsBanner.vue";

const data = ref<SectorRotationResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await fetchSectorRotation();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Scan failed";
  } finally {
    loading.value = false;
  }
}

function rsClass(value: number): string {
  return value >= 0 ? "pos" : "neg";
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-header">
      <h2>Sector Rotation</h2>
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

      <table class="ranking">
        <thead>
          <tr>
            <th>#</th>
            <th>Sector</th>
            <th>RS 1m</th>
            <th>RS 3m</th>
            <th>RS 6m</th>
            <th>Money flow</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in data.results" :key="r.sectorSymbol">
            <td>{{ r.rank }}</td>
            <td>{{ r.sectorSymbol }} — {{ r.sectorName }}</td>
            <td :class="rsClass(r.relativeStrength1m)">{{ r.relativeStrength1m.toFixed(2) }}%</td>
            <td :class="rsClass(r.relativeStrength3m)">{{ r.relativeStrength3m.toFixed(2) }}%</td>
            <td :class="rsClass(r.relativeStrength6m)">{{ r.relativeStrength6m.toFixed(2) }}%</td>
            <td class="flow" :class="r.moneyFlowTrend">{{ r.moneyFlowTrend }}</td>
          </tr>
        </tbody>
      </table>
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
.ranking {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
}
.ranking th,
.ranking td {
  padding: 10px 12px;
  text-align: left;
  color: var(--text-primary);
}
.ranking thead {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ranking tbody tr:not(:last-child) td {
  border-bottom: 1px solid var(--border-subtle);
}
.ranking tbody tr:hover td {
  background: var(--surface-hover);
}
.ranking td.pos {
  color: var(--positive);
  font-family: var(--font-mono);
}
.ranking td.neg {
  color: var(--negative);
  font-family: var(--font-mono);
}
.flow.accumulation {
  color: var(--positive);
}
.flow.distribution {
  color: var(--negative);
}
.flow.neutral {
  color: var(--text-secondary);
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
