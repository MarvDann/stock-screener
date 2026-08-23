# Handoff: Stock Screener

Context for picking this up in Claude Code. Written so a fresh session
(or a fresh person) can get oriented without re-deriving the design
decisions from scratch.

## What this is

A local web app, run on-demand, with two screens over daily EOD data:

1. **Breakout screen** — flags stocks that have just crossed above their
   150-day SMA (within the last 3 trading days) after a tight
   consolidation ("heartbeat") on above-average volume ("Triggered"),
   plus stocks still consolidating just below their 150-day SMA and
   within 5% of it ("Approaching").
2. **Sector rotation screen** — ranks the 11 SPDR sector ETFs by relative
   strength vs SPY (1m/3m/6m) plus a simple accumulation/distribution
   money-flow read, as a proxy for where institutional money is rotating.

The frontend is Vue 3 (Composition API, `<script setup>`) + Vite +
vue-router, styled with a dark, Trading212-inspired theme. It talks to a
small Express API (`src/server.ts`) which wraps the screen logic. There
is no CLI anymore — `npm run dev` / `pnpm run dev` starts both the API
server and the Vite dev server together, and the app is used by opening
a browser to `http://localhost:5173`. See `README.md` for day-to-day
usage.

## FMP data provider — done

The FMP provider plan (`docs/superpowers/plans/2026-08-23-fmp-provider-implementation.md`,
5 tasks) is fully implemented, type-checked, and each task passed
spec-compliance + code-quality review. Summary of what's actually in place:

- **`FmpMarketDataProvider` (`src/data/fmpProvider.ts`) is implemented and
  is the default provider.** It uses FMP's **`stable`** API
  (`historical-price-eod/full`), not the legacy `v3` endpoint originally
  described in earlier versions of this file — the response is a flat,
  newest-first JSON array, reversed before mapping to `DailyBar[]` (every
  indicator assumes oldest-first). See
  `docs/superpowers/specs/2026-08-23-fmp-provider-design.md` for the full
  endpoint details and rationale. It also filters malformed bars and
  handles non-JSON error response bodies safely (added during code review
  of Task 2 — the first review round flagged both gaps, both are now fixed
  and approved).
- **`YahooMarketDataProvider` was kept**, not deleted, as an explicit
  fallback: `src/server.ts` selects the provider via
  `DATA_PROVIDER` (`fmp` or `yahoo`, default `fmp`).
- **`.env` (gitignored) holds `FMP_API_KEY`**; `package.json`'s `start`
  and `dev:server` scripts load it via `--env-file=.env`.
- **Small necessary addition beyond the plan's stated file list:**
  `MarketDataProvider` in `src/types.ts` was missing `getManyDailyHistories`
  from its interface (it only declared `getDailyHistory`) — a pre-existing
  gap, exposed when Task 3 added an explicit `provider: MarketDataProvider`
  type annotation in `server.ts`. Confirmed necessary (not scope creep) by
  temporarily reverting it and checking `tsc --noEmit` fails without it.

### Live verification — confirmed where data was available, but incomplete

The manual end-to-end check (Task 4) ran into FMP's free-tier daily quota
(250 requests/day) already being exhausted partway through — evidence
points to an earlier session today having already run this same plan
(leftover subagent state matching this plan's task names, timestamped
hours earlier) and burning most/all of the day's quota itself. What was
and wasn't confirmed:

- **`/api/breakout` against FMP returned real, populated data** before the
  quota ran out — e.g. COST correctly flagged "Approaching" (close 947.74,
  sma150 980.05, ~3.30% below), matching an already-validated case from an
  earlier design session.
- **A direct FMP-vs-Yahoo comparison for COST** (the one symbol both
  providers had FMP data for before quota ran out) matched almost exactly
  (close 947.74 vs 947.74, sma150 980.0498 vs 980.0498, pctBelowSma150
  3.2967% vs 3.2967%) — strong confirmation the reversal/field-mapping
  logic is correct.
- **`/api/sector-rotation` has NOT been confirmed working end-to-end
  against real FMP data.** All 11 sector ETFs + benchmark hit HTTP 402
  ("Payment Required") once quota ran out during this run. The code path
  is identical to breakout's (same provider, same per-symbol fetch), so
  there's no reason to suspect a defect, but it's unverified live — a
  genuine gap, not just caution. **Follow-up: re-run `/api/sector-rotation`
  against FMP once the daily quota resets, ideally as the first FMP call of
  a fresh day** so it isn't itself at risk of hitting the wall.
- **Error handling was validated for real by the quota exhaustion itself:**
  `FmpMarketDataProvider.getManyDailyHistories`'s per-symbol try/catch
  correctly caught every 402, logged it, and returned an empty-bars result
  for that symbol rather than crashing the request — both endpoints still
  returned `200` with populated `warnings` arrays instead of erroring out.
- **The `DATA_PROVIDER=yahoo` fallback was verified working for both
  endpoints** (no FMP quota needed) — full populated data both times.

### Verification approach

Same as the rest of this project: no automated test framework (deliberate
choice) — `tsc --noEmit` for type-checking, plus manual end-to-end checks
of `/api/breakout` and `/api/sector-rotation` against real data. See above
for what's been confirmed and what's still outstanding.

## Why things are built the way they are

- **Data layer is an interface (`MarketDataProvider` in `types.ts`), not
  a concrete dependency.** Everything downstream (indicators, screens,
  the API server) only depends on that interface. This is what made the
  FMP swap a contained, mechanical plan rather than a redesign.
- **`yahoo-finance2` is pinned to v4**, not v2 (which is EOL). The v4 API
  requires an instantiated `new YahooFinance()` client and an explicit
  `return: "array"` on `.chart()` calls.
- **Screen logic is fully deterministic** (plain moving-average / range
  math), not LLM-judged. Backtestable and reliable; an LLM
  ranking/summary layer on top was discussed as a possible later
  addition, not built.
- **The breakout screen was redefined** (2026-08-23) from a Minervini-style
  Stage-2 trend template (200-day SMA + rising slope, price above both
  MAs, near 52-week highs) + prior-range-high breakout trigger, to a
  simpler 150-day-SMA-cross definition — see
  `docs/superpowers/specs/2026-08-23-web-frontend-design.md` for the
  full rationale and exact rules ("Triggered" = crossed above MA150
  within 3 days + prior heartbeat consolidation + volume ≥1.4x its
  20-day average; "Approaching" = within 5% below MA150 + currently
  consolidating). The heartbeat consolidation check and volume-ratio
  helper (`indicators/volatility.ts`) were kept unchanged and just
  rewired to the new trigger.
- **No dependency was added for the old SVG chart** (now retired — see
  below); the current web app uses `lightweight-charts`
  (TradingView's library) for real candlestick + volume + SMA overlay
  charts per candidate card.
- **Dark theme** (Trading212-inspired) was a deliberate, complete design
  pass, not incremental tweaks — CSS custom properties in
  `client/src/style.css` define the palette (`--positive`/`--negative`
  kept semantically separate from `--accent`, which is UI-only). Fonts:
  "Instrument Sans" for UI text, "JetBrains Mono" for numeric/tabular
  data (prices, RS percentages) — both loaded via Google Fonts in
  `client/index.html`.

## What was retired (2026-08-23 web frontend rewrite)

- The CLI's console-table printing entry point (`src/index.ts`) —
  replaced by `src/server.ts` (Express API bootstrap).
- `src/report/svgChart.ts` and `src/report/htmlReport.ts` — replaced by
  the Vue card grid + `lightweight-charts`.
- `output/` directory and its generated `near-breakout-report.html` — no
  longer produced.
- The old Stage-2 trend-template breakout logic (see above).
- Two now-unused indicator helpers, `isSmaSlopePositive` and
  `pctOffHigh` in `indicators/movingAverage.ts` (leftovers from the
  trend-template era, only used by that dropped logic).

None of this needs re-litigating; it's settled and gone.

## Known limitations / things not yet validated

- **The breakout redefinition has been validated against real live
  data**, not just synthetic smoke tests — confirmed real "Approaching"
  candidates (e.g. HD, COST, PG, PEP, QCOM on 2026-08-23) with
  internally-consistent metrics, and diagnosed a specific real case
  (MP Materials, ticker `MP`, added to `SAMPLE_UNIVERSE`) that correctly
  falls into neither bucket: it crossed above its MA150 on light volume
  (1.14x vs. the 1.4x minimum) — the volume gate correctly excluded an
  unconfirmed cross, and it can't be "Approaching" either since it's
  already above the SMA post-cross. That's the volume filter doing its
  job, not a bug — but it's a real product gap worth knowing about:
  there's currently no third bucket for "crossed but not yet
  volume-confirmed." Not changed per explicit user decision
  ("leave for now") — revisit if it comes up again.
- **`SAMPLE_UNIVERSE` in `universe.ts`** is a small hand-picked list
  (~32 symbols, including `CEG` and `MP`), not the full S&P 500/Russell
  1000. The FMP swap doesn't require expanding this, but removes the main
  blocker (Yahoo's unofficial/rate-limited endpoint) to eventually doing
  so.
- **No backtesting harness exists yet.** Nothing replays the screen
  bar-by-bar over history to measure hit rate / false-positive rate.
  Still the most important step before trusting live output for real
  decisions.
- **No persistence.** Every page load is a stateless fresh scan —
  nothing is stored, so there's no way yet to track how a flagged setup
  performed after the signal fired.
- **`/api/sector-rotation` against live FMP data is unverified** (as
  opposed to just untrusted) — see "Live verification" above. Re-run it
  once the FMP daily quota resets to close this gap.
- **FMP's free tier is a hard 250-requests/day wall, shared across
  whatever runs against the same key that day** — a full sector-rotation
  scan plus a breakout scan can burn most or all of it, and there's no
  cross-session tracking of how much has been used. `yahoo-finance2`
  remains available as a fallback (`DATA_PROVIDER=yahoo`) precisely for
  this case — it's unofficial/reverse-engineered and prone to occasional
  rate limiting of its own (HTTP 429 from `query2.finance.yahoo.com`,
  observed directly in an earlier session), but has no daily quota.

## Data provider decision (updated context)

Originally decided against building on FMP immediately because the
**bulk EOD endpoint** needed to scan a broad universe efficiently is only
on FMP's Ultimate tier ($149/mo); Starter ($22/mo) gets real-time + 5yr
history but still requires per-symbol calls; the free tier is 250
calls/day with per-symbol calls only. That calculus hasn't changed, and
the free-tier quota limit is no longer theoretical: it was hit for real
during Task 4's verification (see "Live verification" above), most likely
by an earlier session's own testing burning most/all of the day's budget.
`FmpMarketDataProvider` is now implemented and is the default provider;
`YahooMarketDataProvider` stays available as a selectable fallback
(`DATA_PROVIDER=yahoo`) for exactly this case — no daily quota, at the
cost of being an unofficial API. Revisit FMP Starter/Ultimate once usage
patterns under the free tier are better understood (one full breakout +
sector-rotation scan across the sample universe can apparently consume a
large fraction of the daily 250-call budget on its own).

## Suggested next steps, roughly in order

1. **Re-run `/api/sector-rotation` against real FMP data** once the daily
   quota resets, to close the "Live verification" gap noted above —
   ideally as the first FMP call of a fresh day.
2. Build a backtest harness: replay the screen day-by-day over 1-2 years
   of history for the sample universe, log every trigger, and check
   forward returns (e.g. 5/10/20 days later) to see if the signal has
   any edge before trusting it live.
3. Decide what to do about the "crossed but not volume-confirmed" gap
   noted above (add a third bucket? relax the threshold? leave it?) —
   deferred, not decided.
4. Expand `SAMPLE_UNIVERSE` toward the full S&P 500 — note FMP's
   free-tier daily quota (250 calls/day, per-symbol) is now the binding
   constraint on how far this can go without upgrading tiers or relying
   on the Yahoo fallback.
5. Add persistence (SQLite is enough) so scan results and their forward
   performance can be tracked over time.

## File map

```
src/
  types.ts                        MarketDataProvider interface, shared result/API-response types
  data/
    fmpProvider.ts                 Default provider (DATA_PROVIDER=fmp)
    yahooProvider.ts               Fallback provider (DATA_PROVIDER=yahoo)
  indicators/
    movingAverage.ts               SMA, highest/lowest high
    volatility.ts                  Range contraction ("heartbeat"), volume ratio
    relativeStrength.ts            RS vs benchmark, money flow score
  screens/
    breakoutScreen.ts              150-day SMA cross + heartbeat consolidation + volume trigger
    sectorRotationScreen.ts        Ranks 11 SPDR sector ETFs by RS + money flow
  universe.ts                      Sample ticker list
  server.ts                        Express API entry point: GET /api/breakout, GET /api/sector-rotation
client/
  index.html                       Loads Google Fonts (Instrument Sans, JetBrains Mono)
  src/
    main.ts, App.vue               Vue bootstrap, sidebar nav + router-view
    style.css                      Dark theme CSS custom properties (design tokens)
    router/index.ts                vue-router: /breakout, /sector-rotation
    api.ts                         Typed fetch wrappers for the two endpoints
    types.ts                       Client-side mirror of server response shapes
    views/
      BreakoutView.vue             Triggered/Approaching card grid, fetch/error/retry
      SectorRotationView.vue       Ranked table, same fetch/error/retry pattern
    components/
      CandidateCard.vue            Per-symbol card: chart + qualifying metrics
      PriceChart.vue                lightweight-charts candlesticks + volume histogram + SMA150 line
      WarningsBanner.vue           Dismissible per-symbol-fetch-failure banner
docs/superpowers/
  specs/2026-08-23-web-frontend-design.md          The web frontend rewrite design spec
  specs/2026-08-23-fmp-provider-design.md          The FMP provider design spec
  plans/2026-08-23-web-frontend-implementation.md  Web frontend's implementation plan (done)
  plans/2026-08-23-fmp-provider-implementation.md  FMP provider's implementation plan (done, all 5 tasks)
```

## .env

Not committed (gitignored). Contains `FMP_API_KEY`, already populated.
Optionally also `DATA_PROVIDER` (`fmp` or `yahoo`) — unset defaults to
`fmp`.
