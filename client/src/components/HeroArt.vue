<script setup lang="ts">
/**
 * Decorative backdrop for the home page hero: a faint chart grid and
 * candlesticks. Generated from a fixed seed so it
 * looks the same on every load, and drawn in theme colours so it works in
 * light and dark mode.
 */
const WIDTH = 800;
const HEIGHT = 240;
const CANDLES = 44;

/** Small deterministic PRNG (mulberry32), so the artwork never changes between loads. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seeded(20260925);
const step = WIDTH / CANDLES;

// A random walk with an upward drift, as candles: each opens at the previous close.
let price = 150;
const candles = Array.from({ length: CANDLES }, (_, i) => {
  const open = price;
  const close = open - (random() - 0.38) * 14;
  price = close;
  return {
    x: i * step + step * 0.2,
    width: step * 0.55,
    open,
    close,
    high: Math.min(open, close) - random() * 8,
    low: Math.max(open, close) + random() * 8,
  };
});

// Keep the candles in the lower part of the box.
const lo = Math.min(...candles.map((c) => c.high));
const hi = Math.max(...candles.map((c) => c.low));
const scaleY = (y: number) => 95 + ((y - lo) / (hi - lo || 1)) * (HEIGHT - 115);

const bodies = candles.map((c) => ({
  x: c.x,
  y: scaleY(Math.min(c.open, c.close)),
  width: c.width,
  height: Math.max(2, Math.abs(scaleY(c.close) - scaleY(c.open))),
  wickX: c.x + c.width / 2,
  wickTop: scaleY(c.high),
  wickBottom: scaleY(c.low),
  rising: c.close <= c.open, // SVG y grows downward
}));

const gridX = Array.from({ length: 11 }, (_, i) => (i * WIDTH) / 10);
const gridY = Array.from({ length: 6 }, (_, i) => (i * HEIGHT) / 5);
</script>

<template>
  <!-- Starts below the hero's top row, so the Refresh button and "Updated" text sit on a clear background. -->
  <div class="hero-art" aria-hidden="true">
  <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
    <g class="grid">
      <line v-for="x in gridX" :key="`x${x}`" :x1="x" :x2="x" y1="0" :y2="HEIGHT" />
      <line v-for="y in gridY" :key="`y${y}`" x1="0" :x2="WIDTH" :y1="y" :y2="y" />
    </g>

    <g v-for="(b, i) in bodies" :key="i" :class="b.rising ? 'candle up' : 'candle down'">
      <line :x1="b.wickX" :x2="b.wickX" :y1="b.wickTop" :y2="b.wickBottom" />
      <rect :x="b.x" :y="b.y" :width="b.width" :height="b.height" rx="1" />
    </g>

  </svg>
  </div>
</template>

<style scoped>
.hero-art {
  position: absolute;
  inset: 64px 0 0 0;
  pointer-events: none;
  /* Soften the top edge into the clear strip above. */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 36px);
  mask-image: linear-gradient(to bottom, transparent 0, #000 36px);
}
.hero-art svg {
  display: block;
  width: 100%;
  height: 100%;
  /* Fade in from the left so the headline and facts stay readable. */
  -webkit-mask-image: linear-gradient(to right, transparent 0%, transparent 28%, #000 75%);
  mask-image: linear-gradient(to right, transparent 0%, transparent 28%, #000 75%);
}
.grid line {
  stroke: var(--border);
  stroke-width: 1;
  opacity: 0.55;
  vector-effect: non-scaling-stroke;
}
.candle line {
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.candle.up line,
.candle.up rect {
  stroke: var(--positive);
  fill: var(--positive);
  opacity: 0.3;
}
.candle.down line,
.candle.down rect {
  stroke: var(--negative);
  fill: var(--negative);
  opacity: 0.22;
}
</style>
