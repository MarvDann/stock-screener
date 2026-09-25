<script setup lang="ts">
import { computed, useId } from "vue";

const props = withDefaults(defineProps<{ values: number[]; width?: number; height?: number }>(), {
  width: 120,
  height: 36,
});

const gradientId = `spark-${useId()}`;
const rising = computed(() => props.values.length < 2 || props.values[props.values.length - 1] >= props.values[0]);
const color = computed(() => (rising.value ? "var(--positive)" : "var(--negative)"));

/** Values scaled into the box, leaving a pixel of headroom so the stroke isn't clipped. */
const points = computed(() => {
  const v = props.values;
  if (v.length < 2) return [];
  const min = Math.min(...v);
  const range = Math.max(...v) - min || 1;
  const pad = 1.5;
  return v.map((value, i) => [
    (i / (v.length - 1)) * props.width,
    pad + (1 - (value - min) / range) * (props.height - pad * 2),
  ]);
});

const line = computed(() => points.value.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "));
const area = computed(() =>
  points.value.length ? `0,${props.height} ${line.value} ${props.width},${props.height}` : ""
);
</script>

<template>
  <svg
    v-if="points.length"
    class="sparkline"
    :viewBox="`0 0 ${props.width} ${props.height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :style="{ stopColor: color, stopOpacity: 0.28 }" />
        <stop offset="100%" :style="{ stopColor: color, stopOpacity: 0 }" />
      </linearGradient>
    </defs>
    <polygon :points="area" :fill="`url(#${gradientId})`" />
    <polyline :points="line" fill="none" :style="{ stroke: color }" stroke-width="1.5" vector-effect="non-scaling-stroke" />
  </svg>
</template>

<style scoped>
.sparkline {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
