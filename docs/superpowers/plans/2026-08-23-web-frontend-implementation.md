# Web Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CLI console output and static near-breakout HTML report with a local Vue 3 web app backed by a small Express API, and redefine the breakout screen around a 150-day SMA cross (per `docs/superpowers/specs/2026-08-23-web-frontend-design.md`).

**Architecture:** `src/` stays the domain layer (indicators, data provider, screens), with `screens/breakoutScreen.ts` rewritten to the new 150-SMA-cross definition. A new `src/server.ts` (Express) exposes `GET /api/breakout` and `GET /api/sector-rotation`, replacing `src/index.ts` as the entry point. A new `client/` directory (Vue 3 + Vite + vue-router) fetches from those endpoints and renders two pages (Breakout, Sector Rotation) behind sidebar navigation, with `lightweight-charts` for per-candidate price charts. Root `package.json` runs both dev servers together via `concurrently`, with Vite proxying `/api/*` to Express.

**Tech Stack:** TypeScript, Express 4, Vue 3 (Composition API, `<script setup>`), Vite, vue-router 4, `lightweight-charts`, `tsx`, `concurrently`, pnpm.

**Testing approach:** Per the spec's "Testing / verification" section, no new automated test framework is introduced for this feature — verification is manual (`tsc`/`vue-tsc` type-checking + running the app and checking real output, including the warning/error states). Each task below ends with a concrete manual verification step instead of an automated test step.

---

## Task 1: Initialize git repository

The project currently has no `.git` — this is needed so work can be committed incrementally as the plan progresses.

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
client/node_modules/
client/dist/
.DS_Store
```

- [ ] **Step 2: Initialize the repo and make a baseline commit**

```bash
git init
git add -A
git commit -m "chore: baseline commit of existing CLI screener"
```

- [ ] **Step 3: Verify**

Run: `git log --oneline`
Expected: one commit, working tree clean (`git status` shows nothing to commit).

---

## Task 2: Retire the CLI console output and legacy HTML report

Per the spec's "What gets retired" section: `report/svgChart.ts`, `report/htmlReport.ts`, the `output/` directory, and the CLI's console-printing entry point (`index.ts`) are all superseded and must be deleted, not left dangling. Nothing else in `src/` imports these files, so deleting them now (before rewriting `breakoutScreen.ts` in Task 3) keeps every commit type-checking cleanly.

**Files:**
- Delete: `src/index.ts`
- Delete: `src/report/htmlReport.ts`
- Delete: `src/report/svgChart.ts`
- Delete: `output/` (generated report directory)
- Delete: `dist/` (stale build output referencing the deleted files)

- [ ] **Step 1: Delete the retired files and directories**

```bash
git rm -r src/index.ts src/report output
rm -rf dist
```

- [ ] **Step 2: Verify nothing else references the deleted files**

Run: `grep -rn "report/htmlReport\|report/svgChart\|from \"./index\"" src/`
Expected: no output (no remaining references).

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: passes with no errors (the only consumer of the deleted files was `index.ts`, which is also gone).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: retire CLI console output and legacy HTML report"
```

---

## Task 3: Rewrite the breakout screen domain logic

Implements the "Breakout screen (new definition)" section of the spec: drop the Stage-2 trend template and prior-range-high trigger, replace with a 150-day SMA cross definition, keeping the heartbeat consolidation check and volume-ratio helper unchanged (just reused with new anchors/periods).

**Files:**
- Modify: `src/types.ts`
- Modify: `src/screens/breakoutScreen.ts`

- [ ] **Step 1: Replace `BreakoutScreenResult` in `src/types.ts` and add API response types**

Replace the existing `BreakoutScreenResult` interface (lines 34-53 of the current file) with:

```typescript
/**
 * Result of running the breakout screen against one symbol.
 */
export interface BreakoutScreenResult {
  symbol: string;
  state: "triggered" | "approaching";
  details: {
    close: number;
    sma150: number;
    /** (sma150 - close) / sma150 * 100. Negative once price is above the SMA. */
    pctBelowSma150: number;
    rangeContractionPct: number; // recent range as % of price, lower = tighter
    volumeRatio: number; // today's volume vs its average
    /** Trading days since the MA150 cross (0 = today). Null when state is "approaching". */
    daysSinceCross: number | null;
  };
}

/** A breakout screen result plus enough recent bars to chart it client-side. */
export interface Candidate extends BreakoutScreenResult {
  bars: DailyBar[];
}

export interface BreakoutScanResponse {
  triggered: Candidate[];
  approaching: Candidate[];
  warnings: string[];
}

export interface SectorRotationScanResponse {
  results: SectorRotationResult[];
  warnings: string[];
}
```

Leave `DailyBar`, `SymbolHistory`, `MarketDataProvider`, and `SectorRotationResult` untouched.

- [ ] **Step 2: Rewrite `src/screens/breakoutScreen.ts`**

Replace the entire file with:

```typescript
import { BreakoutScreenResult, SymbolHistory } from "../types";
import { sma } from "../indicators/movingAverage";
import { isVolatilityContracting, rangeContractionPct, volumeRatio } from "../indicators/volatility";

export interface BreakoutScreenConfig {
  /** Bars in the "tight" consolidation window used by the heartbeat check. Default 15 trading days. */
  consolidationPeriod: number;
  /** Prior window compared against to confirm contraction. Default 40 trading days. */
  priorPeriod: number;
  /** Max distance below the 150-day SMA, as a percent, to count as "approaching". Default 5. */
  approachingThresholdPct: number;
  /** Minimum volume multiple vs average for a cross to count as a confirmed trigger. Default 1.4x. */
  minTriggerVolumeRatio: number;
  /** Lookback for the average-volume baseline used by the trigger's volume check. Default 20 trading days. */
  volumeAvgPeriod: number;
  /** How many trailing trading days (including today) to look back for the MA150 cross. Default 3. */
  crossLookbackDays: number;
}

export const DEFAULT_BREAKOUT_CONFIG: BreakoutScreenConfig = {
  consolidationPeriod: 15,
  priorPeriod: 40,
  approachingThresholdPct: 5,
  minTriggerVolumeRatio: 1.4,
  volumeAvgPeriod: 20,
  crossLookbackDays: 3,
};

/**
 * Finds the most recent trading day, within the last `lookbackDays` days
 * (inclusive of `endIndex`), on which the close crossed from at-or-below
 * the 150-day SMA to above it. Returns null if price isn't above the SMA
 * today, or no such crossing occurred in the window.
 */
function findCrossDayIndex(
  bars: SymbolHistory["bars"],
  endIndex: number,
  lookbackDays: number
): number | null {
  const todaySma = sma(bars, 150, endIndex);
  if (isNaN(todaySma) || bars[endIndex].close <= todaySma) return null;

  for (let d = endIndex; d > endIndex - lookbackDays && d - 1 >= 0; d--) {
    const smaAtD = sma(bars, 150, d);
    const smaAtPrev = sma(bars, 150, d - 1);
    if (isNaN(smaAtD) || isNaN(smaAtPrev)) continue;
    if (bars[d].close > smaAtD && bars[d - 1].close <= smaAtPrev) {
      return d;
    }
  }
  return null;
}

/**
 * Runs the breakout screen against one symbol's history using the
 * 150-day SMA cross definition. Requires at least 150 bars to compute the
 * SMA at all; returns null below that (naturally means "no state" once
 * enough bars exist and none of the conditions hold, too).
 */
export function runBreakoutScreen(
  history: SymbolHistory,
  config: BreakoutScreenConfig = DEFAULT_BREAKOUT_CONFIG
): BreakoutScreenResult | null {
  const { bars, symbol } = history;
  const endIndex = bars.length - 1;
  const sma150 = sma(bars, 150, endIndex);
  if (isNaN(sma150)) return null;

  const close = bars[endIndex].close;
  const pctBelowSma150 = ((sma150 - close) / sma150) * 100;

  const crossDayIndex = findCrossDayIndex(bars, endIndex, config.crossLookbackDays);
  if (crossDayIndex !== null) {
    const heartbeatAnchor = crossDayIndex - 1;
    const isConsolidating = isVolatilityContracting(
      bars,
      config.consolidationPeriod,
      config.priorPeriod,
      heartbeatAnchor
    );
    const volRatio = volumeRatio(bars, config.volumeAvgPeriod, endIndex);

    if (isConsolidating && volRatio >= config.minTriggerVolumeRatio) {
      return {
        symbol,
        state: "triggered",
        details: {
          close,
          sma150,
          pctBelowSma150,
          rangeContractionPct: rangeContractionPct(bars, config.consolidationPeriod, heartbeatAnchor),
          volumeRatio: volRatio,
          daysSinceCross: endIndex - crossDayIndex,
        },
      };
    }
  }

  const isApproaching =
    close < sma150 &&
    pctBelowSma150 <= config.approachingThresholdPct &&
    isVolatilityContracting(bars, config.consolidationPeriod, config.priorPeriod, endIndex);

  if (isApproaching) {
    return {
      symbol,
      state: "approaching",
      details: {
        close,
        sma150,
        pctBelowSma150,
        rangeContractionPct: rangeContractionPct(bars, config.consolidationPeriod, endIndex),
        volumeRatio: volumeRatio(bars, config.volumeAvgPeriod, endIndex),
        daysSinceCross: null,
      },
    };
  }

  return null;
}

/**
 * Runs the breakout screen across many symbols and splits the qualifying
 * results into triggered vs. approaching buckets.
 */
export function scanBreakoutScreen(
  histories: SymbolHistory[],
  config: BreakoutScreenConfig = DEFAULT_BREAKOUT_CONFIG
): { triggered: BreakoutScreenResult[]; approaching: BreakoutScreenResult[] } {
  const results = histories
    .map((h) => runBreakoutScreen(h, config))
    .filter((r): r is BreakoutScreenResult => r !== null);

  return {
    triggered: results.filter((r) => r.state === "triggered"),
    approaching: results.filter((r) => r.state === "approaching"),
  };
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: passes with no errors.

- [ ] **Step 4: Manual smoke test with synthetic data**

Create a scratch file `/tmp/breakout-smoke.ts` (not committed) with fabricated bars shaped like a stock that consolidates below its 150-SMA then crosses above it on a volume spike, and confirm `runBreakoutScreen` returns `state: "triggered"` for the cross day and `state: "approaching"` for a day just before the cross. Run with:

```bash
pnpm exec tsx /tmp/breakout-smoke.ts
```

Expected: prints a `"triggered"` result on the cross day and an `"approaching"` result on the days leading up to it, with `daysSinceCross` and `pctBelowSma150` values that make sense given the fabricated data. Delete the scratch file when done.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: redefine breakout screen around 150-day SMA cross"
```

---

## Task 4: Add the Express API server

Implements the "New Express API server" section of the spec: two endpoints, per-symbol fetch failures reported as warnings, whole-scan failures returned as non-2xx responses.

**Files:**
- Create: `src/server.ts`
- Modify: `package.json`

- [ ] **Step 1: Add server dependencies**

```bash
pnpm add express
pnpm add -D @types/express tsx concurrently
pnpm remove ts-node
```

- [ ] **Step 2: Create `src/server.ts`**

```typescript
import express from "express";
import { YahooMarketDataProvider } from "./data/yahooProvider";
import { scanBreakoutScreen, DEFAULT_BREAKOUT_CONFIG } from "./screens/breakoutScreen";
import { runSectorRotationScreen, SECTOR_ETFS } from "./screens/sectorRotationScreen";
import { SAMPLE_UNIVERSE, BENCHMARK_SYMBOL } from "./universe";
import { BreakoutScreenResult, Candidate, SymbolHistory } from "./types";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const LOOKBACK_CALENDAR_DAYS = 400; // covers 200+ trading days with margin for weekends/holidays
const CHART_BARS = 120;

const provider = new YahooMarketDataProvider();

function toCandidate(result: BreakoutScreenResult, history: SymbolHistory): Candidate {
  return { ...result, bars: history.bars.slice(-CHART_BARS) };
}

app.get("/api/breakout", async (_req, res) => {
  try {
    const histories = await provider.getManyDailyHistories(SAMPLE_UNIVERSE, LOOKBACK_CALENDAR_DAYS);
    const warnings = histories
      .filter((h) => h.bars.length === 0)
      .map((h) => `Skipped ${h.symbol}: fetch failed`);
    const validHistories = histories.filter((h) => h.bars.length > 0);
    const historiesBySymbol = new Map(validHistories.map((h) => [h.symbol, h]));

    const { triggered, approaching } = scanBreakoutScreen(validHistories, DEFAULT_BREAKOUT_CONFIG);

    res.json({
      triggered: triggered.map((r) => toCandidate(r, historiesBySymbol.get(r.symbol)!)),
      approaching: approaching.map((r) => toCandidate(r, historiesBySymbol.get(r.symbol)!)),
      warnings,
    });
  } catch (err) {
    console.error("Breakout scan failed:", err);
    res.status(502).json({ error: "Breakout scan failed", message: (err as Error).message });
  }
});

app.get("/api/sector-rotation", async (_req, res) => {
  try {
    const sectorSymbols = Object.keys(SECTOR_ETFS);
    const [sectorHistories, benchmarkHistory] = await Promise.all([
      provider.getManyDailyHistories(sectorSymbols, LOOKBACK_CALENDAR_DAYS),
      provider.getDailyHistory(BENCHMARK_SYMBOL, LOOKBACK_CALENDAR_DAYS),
    ]);

    if (benchmarkHistory.bars.length === 0) {
      res.status(502).json({
        error: "Sector rotation scan failed",
        message: `Benchmark ${BENCHMARK_SYMBOL} fetch failed`,
      });
      return;
    }

    const warnings = sectorHistories
      .filter((h) => h.bars.length === 0)
      .map((h) => `Skipped ${h.symbol}: fetch failed`);
    const validHistories = sectorHistories.filter((h) => h.bars.length > 0);

    const results = runSectorRotationScreen(validHistories, benchmarkHistory);
    res.json({ results, warnings });
  } catch (err) {
    console.error("Sector rotation scan failed:", err);
    res.status(502).json({ error: "Sector rotation scan failed", message: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 3: Update `package.json` scripts, `main`, and dependencies**

```json
{
  "name": "stock-screener",
  "version": "0.1.0",
  "description": "Consolidation/breakout screener + sector rotation tracker",
  "main": "dist/server.js",
  "type": "commonjs",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev:server": "tsx watch src/server.ts",
    "dev:client": "pnpm --dir client dev",
    "dev": "concurrently -n api,web -c blue,green \"pnpm run dev:server\" \"pnpm run dev:client\""
  },
  "dependencies": {
    "express": "^4.19.2",
    "yahoo-finance2": "^4.0.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.10",
    "concurrently": "^8.2.2",
    "tsx": "^4.16.2",
    "typescript": "^5.5.4"
  }
}
```

(Exact resolved versions from `pnpm add` in Step 1 may differ slightly — keep whatever `pnpm add` wrote to `package.json`, this is the target shape.)

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: passes with no errors.

- [ ] **Step 5: Manually verify the server boots and serves both endpoints**

```bash
pnpm run dev:server &
sleep 2
curl -s http://localhost:3001/api/breakout | head -c 800
echo
curl -s http://localhost:3001/api/sector-rotation | head -c 800
kill %1
```

Expected: both calls return JSON (either real data, or — if Yahoo rate-limits (HTTP 429) or is unreachable — a `{"error": "...", "message": "..."}` body with a non-2xx status, which is the documented failure path, not a crash). If you see a 429/network failure, that's an environment condition to retry later, not a plan defect; re-run once before concluding something's actually broken.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Express API server exposing /api/breakout and /api/sector-rotation"
```

---

## Task 5: Scaffold the Vue client app shell

Sets up `client/` as an independent Vite + Vue 3 + vue-router project with sidebar navigation, per the spec's "New `client/` directory" section. Views are stubs in this task; real content comes in Tasks 6-7.

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.ts`
- Create: `client/tsconfig.json`
- Create: `client/tsconfig.node.json`
- Create: `client/index.html`
- Create: `client/src/main.ts`
- Create: `client/src/style.css`
- Create: `client/src/App.vue`
- Create: `client/src/router/index.ts`
- Create: `client/src/types.ts`
- Create: `client/src/api.ts`
- Create: `client/src/views/BreakoutView.vue` (stub)
- Create: `client/src/views/SectorRotationView.vue` (stub)

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "stock-screener-client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.4.34",
    "vue-router": "^4.4.0",
    "lightweight-charts": "^4.1.7"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.1.1",
    "typescript": "^5.5.4",
    "vite": "^5.3.5",
    "vue-tsc": "^2.0.29"
  }
}
```

- [ ] **Step 2: Create `client/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create `client/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Stock Screener</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `client/src/style.css`**

```css
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #1e293b;
}
```

- [ ] **Step 7: Create `client/src/types.ts`**

```typescript
export interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BreakoutCandidate {
  symbol: string;
  state: "triggered" | "approaching";
  details: {
    close: number;
    sma150: number;
    pctBelowSma150: number;
    rangeContractionPct: number;
    volumeRatio: number;
    daysSinceCross: number | null;
  };
  bars: DailyBar[];
}

export interface BreakoutResponse {
  triggered: BreakoutCandidate[];
  approaching: BreakoutCandidate[];
  warnings: string[];
}

export interface SectorRotationResult {
  sectorSymbol: string;
  sectorName: string;
  relativeStrength1m: number;
  relativeStrength3m: number;
  relativeStrength6m: number;
  moneyFlowTrend: "accumulation" | "distribution" | "neutral";
  rank: number;
}

export interface SectorRotationResponse {
  results: SectorRotationResult[];
  warnings: string[];
}
```

- [ ] **Step 8: Create `client/src/api.ts`**

```typescript
import type { BreakoutResponse, SectorRotationResponse } from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Request to ${url} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchBreakout(): Promise<BreakoutResponse> {
  return fetchJson<BreakoutResponse>("/api/breakout");
}

export function fetchSectorRotation(): Promise<SectorRotationResponse> {
  return fetchJson<SectorRotationResponse>("/api/sector-rotation");
}
```

- [ ] **Step 9: Create `client/src/router/index.ts`**

```typescript
import { createRouter, createWebHistory } from "vue-router";
import BreakoutView from "../views/BreakoutView.vue";
import SectorRotationView from "../views/SectorRotationView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/breakout" },
    { path: "/breakout", name: "breakout", component: BreakoutView },
    { path: "/sector-rotation", name: "sector-rotation", component: SectorRotationView },
  ],
});

export default router;
```

- [ ] **Step 10: Create stub views**

`client/src/views/BreakoutView.vue`:

```vue
<template>
  <div>
    <h2>Breakout</h2>
  </div>
</template>
```

`client/src/views/SectorRotationView.vue`:

```vue
<template>
  <div>
    <h2>Sector Rotation</h2>
  </div>
</template>
```

- [ ] **Step 11: Create `client/src/App.vue`**

```vue
<script setup lang="ts"></script>

<template>
  <div class="app-shell">
    <nav class="sidebar">
      <h1 class="brand">Stock Screener</h1>
      <RouterLink to="/breakout" class="nav-link">Breakout</RouterLink>
      <RouterLink to="/sector-rotation" class="nav-link">Sector Rotation</RouterLink>
    </nav>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}
.sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #0f172a;
  color: #e2e8f0;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.brand {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 16px;
  color: #f8fafc;
}
.nav-link {
  color: #cbd5e1;
  text-decoration: none;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 14px;
}
.nav-link:hover {
  background: #1e293b;
}
.nav-link.router-link-active {
  background: #2563eb;
  color: white;
}
.content {
  flex: 1;
  padding: 32px;
  background: #f8fafc;
}
</style>
```

- [ ] **Step 12: Create `client/src/main.ts`**

```typescript
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./style.css";

createApp(App).use(router).mount("#app");
```

- [ ] **Step 13: Install client dependencies and verify it boots**

```bash
pnpm --dir client install
pnpm --dir client exec vue-tsc -b --noEmit
pnpm --dir client dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
kill %1
```

Expected: `vue-tsc` type-checks cleanly; the curl call to `http://localhost:5173/` returns `200`.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vue client app shell with sidebar navigation"
```

---

## Task 6: Build the Breakout page

Implements the spec's "Breakout (`/breakout`)" page: one page, Triggered and Approaching sections, each a card grid with a price chart per candidate, plus the warnings banner and error/retry state from the spec's "Error handling" section.

**Files:**
- Create: `client/src/components/WarningsBanner.vue`
- Create: `client/src/components/PriceChart.vue`
- Create: `client/src/components/CandidateCard.vue`
- Modify: `client/src/views/BreakoutView.vue`

- [ ] **Step 1: Create `client/src/components/WarningsBanner.vue`**

```vue
<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{ warnings: string[] }>();
const dismissed = ref(false);

watch(
  () => props.warnings,
  () => {
    dismissed.value = false;
  }
);
</script>

<template>
  <div v-if="props.warnings.length > 0 && !dismissed" class="banner">
    <div class="text">
      <strong>{{ props.warnings.length }} symbol(s) skipped:</strong>
      {{ props.warnings.join("; ") }}
    </div>
    <button class="dismiss" @click="dismissed = true">Dismiss</button>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  color: #92400e;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 20px;
}
.dismiss {
  background: none;
  border: none;
  color: #92400e;
  font-weight: 600;
  cursor: pointer;
  font-size: 13px;
}
</style>
```

- [ ] **Step 2: Create `client/src/components/PriceChart.vue`**

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ColorType, LineStyle, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { DailyBar } from "../types";

const props = defineProps<{ bars: DailyBar[]; sma150: number }>();
const container = ref<HTMLDivElement | null>(null);
let chart: IChartApi | null = null;
let series: ISeriesApi<"Line"> | null = null;

function render() {
  if (!container.value) return;
  if (chart) {
    chart.remove();
    chart = null;
  }

  chart = createChart(container.value, {
    width: container.value.clientWidth,
    height: 160,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: "#64748b",
      fontSize: 10,
    },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    timeScale: { borderVisible: false },
    rightPriceScale: { borderVisible: false },
    handleScroll: false,
    handleScale: false,
  });

  series = chart.addLineSeries({ color: "#2563eb", lineWidth: 2 });
  series.setData(props.bars.map((b) => ({ time: b.date.slice(0, 10), value: b.close })));

  if (!Number.isNaN(props.sma150)) {
    series.createPriceLine({
      price: props.sma150,
      color: "#9333ea",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: "150 SMA",
      axisLabelVisible: true,
    });
  }
}

onMounted(render);
onBeforeUnmount(() => chart?.remove());
watch(() => props.bars, render);
</script>

<template>
  <div ref="container" class="chart"></div>
</template>

<style scoped>
.chart {
  width: 100%;
  height: 160px;
}
</style>
```

- [ ] **Step 3: Create `client/src/components/CandidateCard.vue`**

```vue
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
    <PriceChart :bars="props.candidate.bars" :sma150="props.candidate.details.sma150" />
    <p class="summary">{{ summary(props.candidate) }}</p>
  </div>
</template>

<style scoped>
.card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px;
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
}
.close {
  font-variant-numeric: tabular-nums;
  color: #64748b;
  font-size: 13px;
}
.summary {
  margin: 8px 0 0;
  font-size: 12px;
  color: #475569;
}
</style>
```

- [ ] **Step 4: Replace `client/src/views/BreakoutView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchBreakout } from "../api";
import type { BreakoutResponse } from "../types";
import CandidateCard from "../components/CandidateCard.vue";
import WarningsBanner from "../components/WarningsBanner.vue";

const data = ref<BreakoutResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await fetchBreakout();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Scan failed";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-header">
      <h2>Breakout</h2>
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

      <section>
        <h3>Triggered ({{ data.triggered.length }})</h3>
        <p v-if="data.triggered.length === 0" class="empty">No triggered breakouts right now.</p>
        <div v-else class="grid">
          <CandidateCard v-for="c in data.triggered" :key="c.symbol" :candidate="c" />
        </div>
      </section>

      <section>
        <h3>Approaching ({{ data.approaching.length }})</h3>
        <p v-if="data.approaching.length === 0" class="empty">No candidates approaching a breakout right now.</p>
        <div v-else class="grid">
          <CandidateCard v-for="c in data.approaching" :key="c.symbol" :candidate="c" />
        </div>
      </section>
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
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}
.empty {
  color: #64748b;
  font-size: 13px;
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
```

- [ ] **Step 5: Type-check the client**

Run: `pnpm --dir client exec vue-tsc -b --noEmit`
Expected: passes with no errors.

- [ ] **Step 6: Manually verify in a browser**

Start both servers (`pnpm run dev:server` and `pnpm run dev:client` in separate terminals, or wait for Task 8's combined `pnpm run dev`). Using the Playwright MCP tools (`mcp__plugin_playwright_playwright__browser_navigate` to `http://localhost:5173/breakout`, then `mcp__plugin_playwright_playwright__browser_snapshot` or `browser_take_screenshot`), confirm:
- The sidebar shows "Breakout" and "Sector Rotation" links, with "Breakout" highlighted as active.
- The page shows "Triggered" and "Approaching" section headers with candidate counts.
- If any candidates are returned, each card renders a chart (not a blank/broken area) and a metrics summary line.
- Clicking "Refresh" re-fetches without a full page reload (URL stays `/breakout`).

Expected: page renders without console errors; if the API call fails (e.g. Yahoo rate limit), the error/retry state renders instead of a blank page.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: build Breakout page with candidate cards and price charts"
```

---

## Task 7: Build the Sector Rotation page

Implements the spec's "Sector Rotation (`/sector-rotation`)" page: unchanged ranking logic, rendered as a table, with the same warnings/error handling pattern as the Breakout page.

**Files:**
- Modify: `client/src/views/SectorRotationView.vue`

- [ ] **Step 1: Replace `client/src/views/SectorRotationView.vue`**

```vue
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
            <td :class="r.relativeStrength1m >= 0 ? 'pos' : 'neg'">{{ r.relativeStrength1m.toFixed(2) }}%</td>
            <td :class="r.relativeStrength3m >= 0 ? 'pos' : 'neg'">{{ r.relativeStrength3m.toFixed(2) }}%</td>
            <td :class="r.relativeStrength6m >= 0 ? 'pos' : 'neg'">{{ r.relativeStrength6m.toFixed(2) }}%</td>
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
```

- [ ] **Step 2: Type-check the client**

Run: `pnpm --dir client exec vue-tsc -b --noEmit`
Expected: passes with no errors.

- [ ] **Step 3: Manually verify in a browser**

Using Playwright MCP, navigate to `http://localhost:5173/sector-rotation` and confirm:
- The sidebar highlights "Sector Rotation" as active.
- A table renders with columns `#`, `Sector`, `RS 1m`, `RS 3m`, `RS 6m`, `Money flow`.
- Rows are sorted by rank ascending (rank 1 first), matching descending 3-month relative strength.
- Positive/negative RS values are colored distinctly (green/red).

Expected: table renders correctly, or the error/retry state shows if the API call failed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: build Sector Rotation page as a ranked table"
```

---

## Task 8: Wire up the combined dev workflow and verify end-to-end

Confirms the spec's "Dev workflow" section works as one command, and does the full manual verification pass described in the spec's "Testing / verification" section — including forcing the warning and error states.

**Files:** none (verification only)

- [ ] **Step 1: Run the combined dev command**

```bash
pnpm run dev
```

Expected: both the API server (port 3001) and Vite dev server (port 5173) start and stay running, with `concurrently` prefixing output by `api`/`web`.

- [ ] **Step 2: Verify both pages load live data**

Using Playwright MCP, navigate to `http://localhost:5173/breakout` and `http://localhost:5173/sector-rotation` in turn. Confirm:
- Breakout page's Triggered/Approaching split looks sane for a few known large-cap symbols (e.g. check whether AAPL/MSFT/NVDA appear in either bucket and whether their displayed metrics — `close`, `pctBelowSma150` or `daysSinceCross`, `rangeContractionPct`, `volumeRatio` — are internally consistent, e.g. an "approaching" candidate's `pctBelowSma150` is between 0 and 5).
- Sector Rotation ranking looks sane (e.g. sectors are ordered by descending 3-month RS, and the money-flow label matches the sign of the underlying trend shown for a symbol or two you spot-check).

If Yahoo returns 429/rate-limit errors during this check, wait a minute and retry — this project explicitly runs against the free, unofficial `yahoo-finance2` endpoint (see `HANDOFF.md`), so transient rate limiting is expected, not a bug to fix here.

- [ ] **Step 3: Force and verify the per-symbol warning state**

Temporarily edit `src/universe.ts` to add an invalid symbol to `SAMPLE_UNIVERSE`:

```typescript
export const SAMPLE_UNIVERSE: string[] = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO",
  "JPM", "V", "MA", "UNH", "HD", "COST", "PG", "XOM", "CVX",
  "LLY", "ABBV", "MRK", "PEP", "KO", "WMT", "DIS", "CRM", "ADBE",
  "AMD", "NFLX", "INTC", "QCOM", "ZZZZINVALIDTICKER",
];
```

Restart the API server (or let `tsx watch` pick up the change), reload `/breakout` in the browser, and confirm the dismissible warnings banner appears listing `Skipped ZZZZINVALIDTICKER: fetch failed`. Click "Dismiss" and confirm it disappears. Then revert `src/universe.ts` back to its original contents (`git checkout -- src/universe.ts`).

- [ ] **Step 4: Force and verify the whole-scan error state**

Stop the API server (kill the `dev:server` process, or run only `pnpm run dev:client`). Reload `/breakout` (or `/sector-rotation`) in the browser and confirm the "Scan failed — try again" error state renders with a working "Retry" button. Restart the API server and click "Retry" to confirm it recovers.

- [ ] **Step 5: Confirm `git status` is clean after the forced-failure tests**

Run: `git status`
Expected: clean working tree (Step 3's temporary edit was reverted; no other stray changes from the manual testing).

- [ ] **Step 6: Commit** (only if any fixes were needed during verification; otherwise skip — this task is verification-only)

```bash
git add -A
git commit -m "fix: <describe whatever verification surfaced, if anything>"
```

---

## Task 9: Update project docs

The README's "Setup" and usage sections currently describe the retired CLI workflow (`npm run dev` printing to console, `output/near-breakout-report.html`). Update it to reflect the new web app usage model, per the spec's "Usage model" section.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# Stock Screener

A local web app with two screens, run on-demand against live end-of-day data:

1. **Breakout screen** — flags stocks that have just crossed above their
   150-day SMA (within the last 3 trading days) after a tight consolidation
   ("heartbeat") on above-average volume ("Triggered"), plus stocks still
   consolidating just below their 150-day SMA and within 5% of it
   ("Approaching").
2. **Sector rotation screen** — ranks the 11 SPDR sector ETFs by relative
   strength vs SPY over 1/3/6-month windows, plus a simple money-flow
   (accumulation/distribution) read, to show which sectors institutional
   money is rotating into or out of.

## Setup

```bash
pnpm install
pnpm --dir client install
pnpm run dev
```

This starts the Express API server (port 3001) and the Vite dev server
(port 5173) together. Open `http://localhost:5173` in a browser — it
redirects to the Breakout page. Each page fetches fresh data on load; use
the "Refresh" button on a page to re-run the scan without reloading.

No API key required — the data layer uses `yahoo-finance2`, a free
wrapper around Yahoo Finance's public chart endpoints.

## Project structure

```
src/
  types.ts                     Shared interfaces (bars, provider, results)
  data/
    yahooProvider.ts           Free data provider (swap for FMP/Polygon later)
  indicators/
    movingAverage.ts           SMA, slope, highest/lowest high, % off high
    volatility.ts              Range contraction ("heartbeat"), volume ratio
    relativeStrength.ts        RS vs benchmark, money flow score
  screens/
    breakoutScreen.ts          150-day SMA cross + heartbeat consolidation
    sectorRotationScreen.ts    Ranks sector ETFs by RS + money flow
  universe.ts                  Starter ticker list — swap for full S&P 500
  server.ts                    Express API: GET /api/breakout, GET /api/sector-rotation
client/
  src/
    views/                     BreakoutView.vue, SectorRotationView.vue
    components/                CandidateCard.vue, PriceChart.vue, WarningsBanner.vue
    api.ts                     Typed fetch wrappers for the two endpoints
    router/                    vue-router config (two routes, sidebar nav in App.vue)
```

## Swapping the data provider

Everything downstream of `MarketDataProvider` (in `src/types.ts`) only
depends on that interface, not on Yahoo specifically. To move to FMP or
Polygon later, implement the same interface (`getDailyHistory`) against
the new API and swap the import in `src/server.ts` — no changes needed to
indicators or screens.

## Tuning the breakout screen

Defaults live in `DEFAULT_BREAKOUT_CONFIG` in `src/screens/breakoutScreen.ts`:

- `consolidationPeriod` (15 days) / `priorPeriod` (40 days) — the two
  windows compared to confirm the trading range is actually contracting,
  not just narrow by chance.
- `approachingThresholdPct` (5%) — how close to the 150-day SMA a stock
  must be, from below, to count as "approaching".
- `minTriggerVolumeRatio` (1.4x) / `volumeAvgPeriod` (20 days) — how much
  above its 20-day average volume the cross day needs to be to count as a
  confirmed trigger vs noise.
- `crossLookbackDays` (3) — how many trailing trading days to look back
  for the MA150 cross itself.

These are starting points, not tuned values — backtest against your own
universe and adjust before trusting the output.

## Next steps

- Expand `SAMPLE_UNIVERSE` to the full S&P 500 / Russell 1000 (deferred
  until a bulk-data provider upgrade — see `HANDOFF.md`).
- Add a backtesting harness that replays the screen bar-by-bar over
  historical data to measure hit rate and false-positive rate before
  trusting live signals.
- Persist daily scan results (SQLite/Postgres) so you can track how
  flagged setups perform after the signal fires.
- Consider an optional LLM ranking/summary layer on top of the
  deterministic screen output, once the screen itself is validated.
```

- [ ] **Step 2: Verify**

Run: `grep -n "output/near-breakout-report\|ts-node\|console" README.md`
Expected: no output (no remaining references to the retired CLI/report workflow).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: update README for the web app usage model"
```

---

## Self-review notes

- **Spec coverage:** Architecture (Tasks 4-5, 8), Pages/Breakout (Task 6), Pages/Sector Rotation (Task 7), Breakout screen redefinition (Task 3), "What gets retired" (Task 2), Universe (unchanged, no task needed — `SAMPLE_UNIVERSE` untouched except the temporary/reverted edit in Task 8 Step 3), Error handling (Tasks 4 and 6/7/8), Testing/verification (Task 8), Dev workflow (Tasks 4, 5, 8) are all covered. Out-of-scope items (backtesting, persistence, full universe, provider swap) are deliberately not addressed, matching the spec.
- **Type consistency checked:** `BreakoutScreenResult`/`Candidate` fields in `src/types.ts` (Task 3) match what `src/server.ts` constructs (Task 4) and what `client/src/types.ts` declares (Task 5) — `symbol`, `state`, `details.{close,sma150,pctBelowSma150,rangeContractionPct,volumeRatio,daysSinceCross}`, `bars`. `scanBreakoutScreen`'s `{ triggered, approaching }` shape matches the `/api/breakout` response shape (plus `warnings`). `SectorRotationResult` is unchanged end-to-end.
