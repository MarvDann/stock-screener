<script setup lang="ts">
import { useRouter } from "vue-router";
import type { BreakoutCandidate } from "../types";
import PriceChart from "./PriceChart.vue";

const router = useRouter();
const props = defineProps<{ candidate: BreakoutCandidate }>();

let downX = 0;
let downY = 0;

function onPointerDown(e: PointerEvent) {
  downX = e.clientX;
  downY = e.clientY;
}

function openDetail(e: PointerEvent) {
  const dx = Math.abs(e.clientX - downX);
  const dy = Math.abs(e.clientY - downY);
  if (dx > 4 || dy > 4) return;
  router.push(`/stock/${props.candidate.symbol}`);
}

function summary(c: BreakoutCandidate): string {
  if (c.state === "triggered") {
    const days = c.details.daysSinceCross;
    const dayLabel = days === 0 ? "today" : `${days} day(s) ago`;
    return `${c.details.volumeRatio.toFixed(1)}x volume · crossed MA50 ${dayLabel} · ${c.details.rangeContractionPct.toFixed(1)}% range`;
  }
  return `${c.details.pctBelowSma50.toFixed(1)}% below 50-day SMA · ${c.details.rangeContractionPct.toFixed(1)}% range`;
}
</script>

<template>
  <div class="card" @pointerdown="onPointerDown" @click="openDetail">
    <div class="card-header">
      <div>
        <h3>{{ props.candidate.name || props.candidate.symbol }}</h3>
        <span class="ticker">{{ props.candidate.symbol }}</span>
      </div>
      <span class="close">{{ props.candidate.details.close.toFixed(2) }}</span>
    </div>
    <PriceChart :bars="props.candidate.bars" :sma50-series="props.candidate.sma50Series" :sma150-series="props.candidate.sma150Series" />
    <p class="summary">{{ summary(props.candidate) }}</p>
  </div>
</template>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.01em;
  line-height: 1.3;
}
.ticker {
  display: inline-block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  font-family: var(--font-mono);
  color: var(--text-muted);
  letter-spacing: 0.04em;
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
