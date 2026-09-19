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
      <button class="btn-primary" :disabled="loading" @click="load">
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
            <th>Mansfield RS</th>
            <th>Money flow</th>
            <th>Capital flow</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in data.results" :key="r.sectorSymbol">
            <td>{{ r.rank }}</td>
            <td>{{ r.sectorSymbol }} — {{ r.sectorName }}</td>
            <td :class="rsClass(r.mansfieldRs)">{{ isNaN(r.mansfieldRs) ? "—" : r.mansfieldRs.toFixed(2) }}</td>
            <td class="flow" :class="r.moneyFlowTrend">{{ r.moneyFlowTrend }}</td>
            <td class="flow" :class="r.capitalFlow">{{ r.capitalFlow }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped>
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
.flow.accumulation,
.flow.accumulating {
  color: var(--positive);
}
.flow.distribution,
.flow.distributing {
  color: var(--negative);
}
.flow.neutral {
  color: var(--text-secondary);
}
</style>
