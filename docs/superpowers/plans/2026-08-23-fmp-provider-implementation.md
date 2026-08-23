# FMP Data Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `FmpMarketDataProvider`, a `MarketDataProvider` implementation backed by Financial Modeling Prep's `stable` API, and make it the default provider while keeping `YahooMarketDataProvider` as an explicit fallback selectable via `DATA_PROVIDER=yahoo`.

**Architecture:** One new file (`src/data/fmpProvider.ts`) implementing the existing `MarketDataProvider` interface, mirroring `src/data/yahooProvider.ts`'s shape (same batching pattern, same per-symbol failure contract). `src/server.ts` picks the provider via a `DATA_PROVIDER` env var. `package.json`'s server scripts load `.env` via Node's `--env-file` flag.

**Tech Stack:** TypeScript, Node 24 built-in `fetch`/`--env-file` (no new dependencies), existing `express` server.

**Reference:** `docs/superpowers/specs/2026-08-23-fmp-provider-design.md` — endpoint shape, response fields, and rationale were all confirmed via a live test call during that design session (see spec for the raw response example).

---

### Task 1: Load `.env` in the server scripts

**Files:**
- Modify: `package.json:9-10`

- [ ] **Step 1: Add `--env-file=.env` to the `start` and `dev:server` scripts**

In `package.json`, change:

```json
    "start": "node dist/server.js",
    "dev:server": "tsx watch src/server.ts",
```

to:

```json
    "start": "node --env-file=.env dist/server.js",
    "dev:server": "tsx watch --env-file=.env src/server.ts",
```

- [ ] **Step 2: Verify the flag is accepted and the key loads**

`.env` already exists at the project root with `FMP_API_KEY` set (created and populated during the design session). Confirm `tsx` accepts the flag and the variable loads, without printing the key value:

Run: `pnpm exec tsx --env-file=.env -e "console.log(process.env.FMP_API_KEY ? 'FMP_API_KEY loaded' : 'FMP_API_KEY missing')"`

Expected output: `FMP_API_KEY loaded`

If `tsx` rejects the flag in that position, try `pnpm exec tsx watch --env-file=.env -e "..."` isn't valid for a one-off run — instead fall back to testing the flag placement directly on `dev:server`'s form: `pnpm exec tsx --env-file=.env watch src/server.ts` (swap the flag before `watch`) and adjust both `package.json` scripts to match whichever order works.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: load .env in server scripts via --env-file"
```

---

### Task 2: Implement `FmpMarketDataProvider`

**Files:**
- Create: `src/data/fmpProvider.ts`

- [ ] **Step 1: Write the provider**

Create `src/data/fmpProvider.ts`:

```typescript
import { DailyBar, MarketDataProvider, SymbolHistory } from "../types";

const FMP_BASE_URL = "https://financialmodelingprep.com/stable/historical-price-eod/full";

interface FmpDailyBar {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  vwap: number;
}

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Financial Modeling Prep-backed data provider, using the `stable` API's
 * historical-price-eod/full endpoint. Requires FMP_API_KEY in the
 * environment (see .env / package.json's --env-file wiring).
 *
 * FMP returns this endpoint's array newest-first; it's reversed before
 * mapping so SymbolHistory.bars stays oldest-first, matching every
 * indicator's assumption.
 */
export class FmpMarketDataProvider implements MarketDataProvider {
  private readonly apiKey: string;

  constructor() {
    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
      throw new Error("FMP_API_KEY is not set. Add it to .env before using FmpMarketDataProvider.");
    }
    this.apiKey = apiKey;
  }

  async getDailyHistory(symbol: string, lookbackDays: number): Promise<SymbolHistory> {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - lookbackDays);

    const url = new URL(FMP_BASE_URL);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("from", toDateParam(from));
    url.searchParams.set("to", toDateParam(to));
    url.searchParams.set("apikey", this.apiKey);

    const response = await fetch(url);
    const body = await response.json();

    if (!response.ok) {
      const message =
        (body as { "Error Message"?: string })["Error Message"] ?? response.statusText;
      throw new Error(`FMP request failed for ${symbol}: ${message}`);
    }

    const raw = body as FmpDailyBar[];
    const bars: DailyBar[] = raw
      .slice()
      .reverse()
      .map((bar) => ({
        date: new Date(bar.date),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }));

    return { symbol, bars };
  }

  /**
   * Fetch several symbols with basic concurrency control and a small
   * delay between batches — FMP's per-minute throttle isn't documented
   * for the free tier, so don't assume it's unlimited.
   */
  async getManyDailyHistories(
    symbols: string[],
    lookbackDays: number,
    batchSize = 10,
    delayMs = 300
  ): Promise<SymbolHistory[]> {
    const results: SymbolHistory[] = [];

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((s) =>
          this.getDailyHistory(s, lookbackDays).catch((err) => {
            console.error(`Failed to fetch ${s}:`, err.message);
            return { symbol: s, bars: [] } as SymbolHistory;
          })
        )
      );
      results.push(...batchResults);

      if (i + batchSize < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Live smoke test against one real symbol**

This spends 1 of the 250 daily FMP requests. Create a throwaway script, run it, then delete it — don't commit it.

```bash
cat > fmp-smoke-test.ts << 'EOF'
import { FmpMarketDataProvider } from "./src/data/fmpProvider";

async function main() {
  const provider = new FmpMarketDataProvider();
  const history = await provider.getDailyHistory("AAPL", 30);
  console.log(`symbol: ${history.symbol}`);
  console.log(`bar count: ${history.bars.length}`);
  console.log(`oldest bar: ${JSON.stringify(history.bars[0])}`);
  console.log(`newest bar: ${JSON.stringify(history.bars[history.bars.length - 1])}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
EOF
pnpm exec tsx --env-file=.env fmp-smoke-test.ts
rm fmp-smoke-test.ts
```

Expected: `bar count` is roughly 20 (trading days in a 30-calendar-day window), no error thrown, and — most importantly — `oldest bar`'s `date` is chronologically before `newest bar`'s `date` (confirms the reversal is correct, not backwards). Each bar's `open`/`high`/`low`/`close`/`volume` should be plausible numbers, not `NaN`/`undefined`.

If this fails with a 401, stop and check that `.env`'s `FMP_API_KEY` value is actually present (without printing it — e.g. `pnpm exec tsx --env-file=.env -e "console.log(process.env.FMP_API_KEY?.length)"` should print a number, not `undefined`).

- [ ] **Step 4: Commit**

```bash
git add src/data/fmpProvider.ts
git commit -m "feat: add FmpMarketDataProvider"
```

---

### Task 3: Wire provider selection into the server

**Files:**
- Modify: `src/server.ts:1-20`

- [ ] **Step 1: Import the new provider and the shared interface type**

In `src/server.ts`, change:

```typescript
import express from "express";
import { YahooMarketDataProvider } from "./data/yahooProvider";
import { scanBreakoutScreen, DEFAULT_BREAKOUT_CONFIG } from "./screens/breakoutScreen";
import { runSectorRotationScreen, SECTOR_ETFS } from "./screens/sectorRotationScreen";
import { SAMPLE_UNIVERSE, BENCHMARK_SYMBOL } from "./universe";
import { sma } from "./indicators/movingAverage";
import {
  BreakoutScanResponse,
  BreakoutScreenResult,
  Candidate,
  SectorRotationScanResponse,
  SymbolHistory,
} from "./types";
```

to:

```typescript
import express from "express";
import { YahooMarketDataProvider } from "./data/yahooProvider";
import { FmpMarketDataProvider } from "./data/fmpProvider";
import { scanBreakoutScreen, DEFAULT_BREAKOUT_CONFIG } from "./screens/breakoutScreen";
import { runSectorRotationScreen, SECTOR_ETFS } from "./screens/sectorRotationScreen";
import { SAMPLE_UNIVERSE, BENCHMARK_SYMBOL } from "./universe";
import { sma } from "./indicators/movingAverage";
import {
  BreakoutScanResponse,
  BreakoutScreenResult,
  Candidate,
  MarketDataProvider,
  SectorRotationScanResponse,
  SymbolHistory,
} from "./types";
```

- [ ] **Step 2: Replace the hardcoded provider instantiation**

Change:

```typescript
const provider = new YahooMarketDataProvider();
```

to:

```typescript
const DATA_PROVIDER = process.env.DATA_PROVIDER ?? "fmp";
const provider: MarketDataProvider =
  DATA_PROVIDER === "yahoo" ? new YahooMarketDataProvider() : new FmpMarketDataProvider();
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: select data provider via DATA_PROVIDER env var, default fmp"
```

---

### Task 4: End-to-end verification

No code changes in this task — manual verification only. Budget note: the breakout scan is ~32 calls and the sector-rotation scan is ~12 calls against FMP's 250/day cap, so run each endpoint once, not repeatedly.

- [ ] **Step 1: Start the app with the default (FMP) provider**

Run: `pnpm run dev`
Expected: both `API server listening on http://localhost:3001` and the Vite dev server's "ready" message print, with no startup error (an immediate throw here means `FMP_API_KEY` isn't loading — recheck Task 1).

- [ ] **Step 2: Hit both endpoints once and inspect the shape**

In a second terminal:

```bash
curl -s http://localhost:3001/api/breakout | head -c 1500
curl -s http://localhost:3001/api/sector-rotation | head -c 1500
```

Expected: both return `200` with populated `triggered`/`approaching`/`results` arrays (not all-empty, unless the market genuinely has no candidates today) and an empty or near-empty `warnings` array. Any `warnings` entries indicate per-symbol fetch failures — check the server's console log for the underlying FMP error message for those symbols.

- [ ] **Step 3: Compare against Yahoo for a couple of symbols**

Stop the dev server (Ctrl+C), then restart the API server only with the Yahoo provider (no FMP quota spent — this is the fallback path):

```bash
DATA_PROVIDER=yahoo pnpm run dev:server
```

In a second terminal, hit `/api/breakout` again and compare a symbol present in both runs' `triggered`/`approaching` lists — `close`, `sma150`, and `pctBelowSma150` should be close (small differences from slightly different fetch timestamps are fine; a large discrepancy, a swapped-looking SMA, or garbage values means the reversal or field-mapping in `fmpProvider.ts` is wrong and needs to be re-checked against Task 2's smoke test output).

Stop the server (Ctrl+C) when done comparing.

- [ ] **Step 4: No commit for this task** (verification only — nothing to check in).

---

### Task 5: Update HANDOFF.md

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Replace the "Immediate next step" section**

Read the current `HANDOFF.md` in full first (it will have shifted slightly from the version quoted when this plan was written). Replace the "## Immediate next step: plug in the FMP data provider" section's content with a short "done" summary covering:

- `FmpMarketDataProvider` (`src/data/fmpProvider.ts`) is implemented and is the default provider.
- It uses FMP's **`stable`** API (`historical-price-eod/full`), not the legacy `v3` endpoint originally described in this file — the response is a flat, newest-first array, reversed before mapping to `DailyBar[]`. See `docs/superpowers/specs/2026-08-23-fmp-provider-design.md` for the full endpoint details and rationale.
- `YahooMarketDataProvider` was kept (not deleted) as an explicit fallback, selectable via `DATA_PROVIDER=yahoo` (default is `fmp`).
- `.env` (gitignored) holds `FMP_API_KEY`; `package.json`'s `start`/`dev:server` scripts load it via `--env-file=.env`.

- [ ] **Step 2: Update the "Data provider decision" and "Known limitations" sections**

- Remove or rewrite the `yahoo-finance2` rate-limiting bullet under "Known limitations" — FMP is now the default, Yahoo is a secondary fallback, not the active provider.
- Update "Suggested next steps" to drop the completed "Plug in FMP" item, renumbering the rest.

- [ ] **Step 3: Commit**

```bash
git add HANDOFF.md
git commit -m "docs: update HANDOFF.md for completed FMP provider integration"
```

---

## Self-Review Notes

- **Spec coverage:** stable-API endpoint + response shape (Task 2), reversal gotcha (Task 2 code + smoke test assertion), fail-fast on missing key (Task 2 constructor), `.env`/`--env-file` wiring (Task 1), `getManyDailyHistories` batching/failure contract (Task 2), provider selection env var + Yahoo kept as fallback (Task 3, per user's explicit decision), verification approach incl. budget awareness (Task 4) — all covered.
- **Type consistency:** `FmpMarketDataProvider` implements `MarketDataProvider` from `src/types.ts` exactly (`getDailyHistory(symbol: string, lookbackDays: number): Promise<SymbolHistory>`), matching `YahooMarketDataProvider`'s signature used in `server.ts`. `getManyDailyHistories`'s signature matches `yahooProvider.ts`'s so `server.ts`'s existing call sites (`provider.getManyDailyHistories(...)`) work unchanged regardless of which provider is selected.
- **Out of scope**, per the design spec, and correctly not touched by this plan: expanding `SAMPLE_UNIVERSE`, a backtesting harness, persistence, the volume-confirmation gap.
