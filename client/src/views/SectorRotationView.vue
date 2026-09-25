<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchSectorRotation } from "../api";
import type { SectorRotationResponse } from "../types";
import WarningsBanner from "../components/WarningsBanner.vue";
import { sectorForEtf, sectorMeta } from "../utils/sectors";

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

/** The Yahoo-named sector an ETF tracks, for linking into Sector Drilldown (names differ, e.g. Financials → Financial Services). */
function drilldownSector(etf: string): string | null {
  return sectorForEtf(etf);
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in data.results" :key="r.sectorSymbol">
            <td>{{ r.rank }}</td>
            <td>
              <RouterLink :to="{ name: 'stock-detail', params: { symbol: r.sectorSymbol } }" class="sector-link">
                <span
                  class="badge"
                  :style="{
                    color: sectorMeta(drilldownSector(r.sectorSymbol) ?? '').color,
                    background: `color-mix(in srgb, ${sectorMeta(drilldownSector(r.sectorSymbol) ?? '').color} 16%, transparent)`,
                  }"
                >
                  <component :is="sectorMeta(drilldownSector(r.sectorSymbol) ?? '').icon" :size="15" />
                </span>
                <span class="sector-name">{{ r.sectorName }}</span>
                <span class="sector-etf">{{ r.sectorSymbol }}</span>
              </RouterLink>
            </td>
            <td :class="rsClass(r.mansfieldRs)">{{ isNaN(r.mansfieldRs) ? "—" : r.mansfieldRs.toFixed(2) }}</td>
            <td class="flow" :class="r.moneyFlowTrend">{{ r.moneyFlowTrend }}</td>
            <td class="flow" :class="r.capitalFlow">{{ r.capitalFlow }}</td>
            <td class="actions">
              <RouterLink
                v-if="drilldownSector(r.sectorSymbol)"
                :to="{ name: 'sector-drilldown', query: { sector: drilldownSector(r.sectorSymbol) } }"
                class="stocks-link"
              >
                Stocks →
              </RouterLink>
            </td>
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
.sector-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
  text-decoration: none;
}
.sector-link:hover .sector-name {
  color: var(--accent);
  text-decoration: underline;
}
.badge {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
}
.sector-name {
  font-weight: 600;
}
.sector-etf {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
.actions {
  text-align: right;
}
.stocks-link {
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
  white-space: nowrap;
}
.stocks-link:hover {
  text-decoration: underline;
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
