<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  values: number[];
}>();

const maxAbs = computed(() => Math.max(0, ...props.values.map((v) => Math.abs(v))));

function barHeight(value: number): string {
  if (maxAbs.value === 0) return "0%";
  return `${(Math.abs(value) / maxAbs.value) * 100}%`;
}
</script>

<template>
  <div v-if="props.values.length === 0" class="eps-empty">No EPS data</div>
  <div v-else class="eps-chart" :style="{ gap: '1px' }">
    <div v-for="(value, i) in props.values" :key="i" class="bar-column">
      <div class="bar-zone bar-zone-positive">
        <div
          v-if="value >= 0"
          class="bar positive"
          :style="{ height: barHeight(value) }"
          :title="value.toFixed(2)"
        ></div>
      </div>
      <div class="baseline"></div>
      <div class="bar-zone bar-zone-negative">
        <div
          v-if="value < 0"
          class="bar negative"
          :style="{ height: barHeight(value) }"
          :title="value.toFixed(2)"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eps-chart {
  display: flex;
  align-items: stretch;
  height: 100%;
  width: 100%;
}
.bar-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.bar-zone {
  flex: 1;
  display: flex;
  justify-content: center;
}
.bar-zone-positive {
  align-items: flex-end;
}
.bar-zone-negative {
  align-items: flex-start;
}
.baseline {
  height: 1px;
  background: var(--border);
  flex-shrink: 0;
}
.bar {
  width: 100%;
}
.bar.positive {
  background: var(--positive);
  border-radius: 2px 2px 0 0;
}
.bar.negative {
  background: var(--negative);
  border-radius: 0 0 2px 2px;
}
.eps-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 12px;
}
</style>
