<script setup lang="ts">
/** The StockWatch mark (a rising line on an accent tile) and wordmark, in the current theme's colours. */
withDefaults(defineProps<{ size?: "sm" | "lg" }>(), { size: "sm" });
</script>

<template>
  <span class="brand-logo" :class="size">
    <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" class="tile" />
      <polyline points="7,21 12.5,15.5 16.5,18.5 23,11" class="line" />
      <circle cx="23" cy="11" r="2.6" class="dot" />
    </svg>
    <span class="wordmark">Stock<span class="accent">Watch</span></span>
  </span>
</template>

<style scoped>
.brand-logo {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--text-primary);
}
.mark {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
}
.lg .mark {
  width: 44px;
  height: 44px;
}
.lg {
  flex-direction: column;
  gap: 12px;
}
.tile {
  fill: var(--accent);
}
.line {
  fill: none;
  stroke: var(--bg);
  stroke-width: 2.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.dot {
  fill: var(--bg);
}
.wordmark {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
}
.lg .wordmark {
  font-size: 24px;
}
.accent {
  color: var(--accent);
}
</style>
