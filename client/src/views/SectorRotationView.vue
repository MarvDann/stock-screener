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
.refresh {
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}
.refresh:disabled {
  opacity: 0.6;
  cursor: default;
}
.ranking {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
}
.ranking th,
.ranking td {
  padding: 8px 12px;
  text-align: left;
}
.ranking thead {
  background: #f1f5f9;
  color: #64748b;
  font-size: 11px;
  text-transform: uppercase;
}
.ranking tbody tr:not(:last-child) td {
  border-bottom: 1px solid #f1f5f9;
}
.pos {
  color: #16a34a;
}
.neg {
  color: #dc2626;
}
.flow.accumulation {
  color: #16a34a;
}
.flow.distribution {
  color: #dc2626;
}
.flow.neutral {
  color: #64748b;
}
.error-state {
  background: white;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 20px;
  color: #991b1b;
}
.error-state .detail {
  font-size: 12px;
  color: #b91c1c;
  margin: 6px 0 12px;
}
.error-state button {
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
}
</style>
