<script setup lang="ts">
import type { BreakoutCandidate } from "../types";
import PriceChart from "./PriceChart.vue";

const props = defineProps<{ candidate: BreakoutCandidate }>();

function summary(c: BreakoutCandidate): string {
  if (c.state === "triggered") {
    const days = c.details.daysSinceCross;
    const dayLabel = days === 0 ? "today" : `${days} day(s) ago`;
    return `${c.details.volumeRatio.toFixed(1)}x volume · crossed MA150 ${dayLabel} · ${c.details.rangeContractionPct.toFixed(1)}% range`;
  }
  return `${c.details.pctBelowSma150.toFixed(1)}% below 150-day SMA · ${c.details.rangeContractionPct.toFixed(1)}% range`;
}
</script>

<template>
  <div class="card">
    <div class="card-header">
      <h3>{{ props.candidate.symbol }}</h3>
      <span class="close">{{ props.candidate.details.close.toFixed(2) }}</span>
    </div>
    <PriceChart :bars="props.candidate.bars" :sma150-series="props.candidate.sma150Series" />
    <p class="summary">{{ summary(props.candidate) }}</p>
  </div>
</template>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  transition: border-color 0.15s ease;
}
.card:hover {
  border-color: var(--border-subtle);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.card-header h3 {
  margin: 0;
  font-size: 15px;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}
.close {
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  font-size: 13px;
}
.summary {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
