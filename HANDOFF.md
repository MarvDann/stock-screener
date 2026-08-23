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

## Immediate next step: implement the FMP data provider

**This is what the next session should do.** The design and implementation
plan for this are both already written and committed — this session's job
is to execute the plan, not to re-derive it:

- **Spec:** `docs/superpowers/specs/2026-08-23-fmp-provider-design.md`
- **Plan:** `docs/superpowers/plans/2026-08-23-fmp-provider-implementation.md`
  (5 tasks, fully detailed with exact code/commands — use
  `superpowers:subagent-driven-development` or `superpowers:executing-plans`
  to run it)

Nothing has been implemented yet — `src/data/` still only has
`yahooProvider.ts`. What's already done, so the new session doesn't repeat
it:

- **The API was researched live.** `HANDOFF.md` previously pointed at FMP's
  legacy `v3` endpoint. That's wrong / stale — a live test call against the
  user's actual free-tier key (during the design session) confirmed FMP's
  current API is a separate `stable` namespace:
  `GET https://financialmodelingprep.com/stable/historical-price-eod/full?symbol={symbol}&from={YYYY-MM-DD}&to={YYYY-MM-DD}&apikey={key}`,
  returning a **flat JSON array**, **newest-first** (not nested under
  `historical` like the legacy shape). See the spec doc for the full
  confirmed response example and field list. The plan's Task 2 already
  contains the correct, tested-against-the-shape implementation.
- **`.env` already exists** at the project root, is already gitignored, and
  already has `FMP_API_KEY` populated (the user added it directly — no
  session has read or displayed the key value, by design). Nothing more
  needed here except the `--env-file=.env` wiring in `package.json`
  (plan Task 1).
- **Budget spent so far:** 1 of FMP's 250 daily requests, from the live
  research call above. Plan Task 2's smoke test spends 1 more; Task 4's
  end-to-end check spends ~44 more (one full scan). Budget-conscious, not
  exhausted — but don't loop test runs carelessly.
- **Open decision from the original handoff was resolved:** keep
  `YahooMarketDataProvider` as an explicit, env-selectable fallback
  (`DATA_PROVIDER=yahoo`, default `fmp`) rather than deleting it — this was
  an explicit user choice made during design, already reflected in the plan.

### Verification approach

Same as the rest of this project: no automated test framework (deliberate
choice) — `tsc --noEmit` for type-checking, plus the plan's Task 4 manual
end-to-end check (`/api/breakout` and `/api/sector-rotation` against real
FMP data, spot-compared against the Yahoo provider for a couple of
symbols). Full detail is in the plan doc — follow it as written rather than
re-deriving verification steps.

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
- **`yahoo-finance2` is still the only *implemented* provider as of this
  handoff** (an unofficial/reverse-engineered API, prone to occasional
  rate limiting — observed directly in an earlier session, HTTP 429 from
  `query2.finance.yahoo.com`). `FmpMarketDataProvider` is designed and
  planned but not yet implemented — see "Immediate next step" above.

## Data provider decision (updated context)

Originally decided against building on FMP immediately because the
**bulk EOD endpoint** needed to scan a broad universe efficiently is only
on FMP's Ultimate tier ($149/mo); Starter ($22/mo) gets real-time + 5yr
history but still requires per-symbol calls; the free tier is 250
calls/day with per-symbol calls only. That calculus hasn't changed — the
free tier is still per-symbol-call-only, confirmed again via the live
research call described above. The user has a free-tier key and it's
already in `.env`; the plan keeps `YahooMarketDataProvider` around as a
selectable fallback rather than assuming FMP's free tier is sufficient
for every situation. Revisit FMP Starter/Ultimate once usage patterns
under the free tier are understood.

## Suggested next steps, roughly in order

1. **Implement the FMP provider** (see "Immediate next step" above) —
   spec and plan are both written; this session should execute the plan.
2. Build a backtest harness: replay the screen day-by-day over 1-2 years
   of history for the sample universe, log every trigger, and check
   forward returns (e.g. 5/10/20 days later) to see if the signal has
   any edge before trusting it live.
3. Decide what to do about the "crossed but not volume-confirmed" gap
   noted above (add a third bucket? relax the threshold? leave it?) —
   deferred, not decided.
4. Expand `SAMPLE_UNIVERSE` toward the full S&P 500 once FMP removes the
   rate-limiting concern (a static list is fine to start — dynamically
   fetching constituents is a later nicety).
5. Add persistence (SQLite is enough) so scan results and their forward
   performance can be tracked over time.

## File map

```
src/
  types.ts                        MarketDataProvider interface, shared result/API-response types
  data/
    yahooProvider.ts               Only implemented provider so far
    fmpProvider.ts                 NOT YET CREATED — see docs/superpowers/plans/2026-08-23-fmp-provider-implementation.md
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
  specs/2026-08-23-fmp-provider-design.md          The FMP provider design spec (this handoff's topic)
  plans/2026-08-23-web-frontend-implementation.md  Web frontend's implementation plan (done)
  plans/2026-08-23-fmp-provider-implementation.md  FMP provider's implementation plan (not yet executed)
```

## .env

Not committed (gitignored). Contains `FMP_API_KEY`, already populated.
Optionally also `DATA_PROVIDER` (`fmp` or `yahoo`) once Task 3 of the
implementation plan adds that selector — unset defaults to `fmp`.
