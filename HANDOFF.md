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
   within 5% of it ("Approaching"). This replaced an earlier
   Minervini-style Stage-2 trend-template + prior-range-high-breakout
   definition — see "Breakout screen redefinition" below for why and
   when.
2. **Sector rotation screen** — ranks the 11 SPDR sector ETFs by relative
   strength vs SPY (1m/3m/6m) plus a simple accumulation/distribution
   money-flow read, as a proxy for where institutional money is rotating.
   Unchanged since the original CLI version.

The frontend is Vue 3 (Composition API, `<script setup>`) + Vite +
vue-router, styled with a dark, Trading212-inspired theme. It talks to a
small Express API (`src/server.ts`) which wraps the screen logic. There
is no CLI anymore — `npm run dev` / `pnpm run dev` starts both the API
server and the Vite dev server together, and the app is used by opening
a browser to `http://localhost:5173`. See `README.md` for day-to-day
usage.

## Immediate next step: plug in the FMP data provider

**This is what the next session should do.** The user has signed up for
Financial Modeling Prep's (FMP) free tier and has an API key ready. The
data layer was deliberately built as an interface for exactly this swap
— see "Why things are built the way they are" below — so this should be
a contained, mechanical piece of work, not a redesign.

### What to build

1. **`src/data/fmpProvider.ts`** — a new class implementing
   `MarketDataProvider` (`src/types.ts`), mirroring the shape of
   `src/data/yahooProvider.ts` (`getDailyHistory(symbol, lookbackDays)`
   and a `getManyDailyHistories(symbols, lookbackDays, batchSize?,
   delayMs?)` convenience method with the same per-symbol
   try/catch-and-return-empty-bars failure handling — `src/server.ts`
   already relies on empty `bars` arrays to build its `warnings` list,
   so preserve that contract exactly).
2. **Endpoint**: FMP's free tier gives you the historical daily price
   endpoint, roughly:
   `https://financialmodelingprep.com/api/v3/historical-price-full/{symbol}?apikey={key}`
   returning `{ symbol, historical: [{ date, open, high, low, close,
   volume, ... }, ...] }`. **Important gotcha**: FMP returns this array
   **newest-first** — `SymbolHistory.bars` is documented (and everywhere
   assumed, e.g. by `sma()`/`highestHigh()`/etc. in `indicators/`) to be
   **oldest-first**. Reverse the array before mapping to `DailyBar[]`, or
   every indicator calculation will be silently wrong (this is the kind
   of bug that wouldn't throw — it'd just quietly produce nonsense SMA
   values, so verify with a manual sanity check, not just a type-check).
3. **API key handling**: don't hardcode it or commit it. Recommended:
   a `.env` file at the project root (`FMP_API_KEY=...`), **added to
   `.gitignore`** before it's created, loaded via Node's built-in
   `--env-file=.env` flag (Node 20.6+ — this repo runs on v24, confirmed
   available, no need to add a `dotenv` dependency). That means updating
   the `dev:server`/`start` scripts in `package.json` to pass
   `--env-file=.env` through to `tsx`/`node`. Read the key in
   `fmpProvider.ts` via `process.env.FMP_API_KEY`, and fail fast with a
   clear error if it's missing rather than silently making unauthenticated
   requests.
4. **Swap the import** in `src/server.ts`: change
   `new YahooMarketDataProvider()` to `new FmpMarketDataProvider()` (or
   whatever you name it). Nothing else in `server.ts`, the screens, or
   the indicators should need to change — that's the whole point of the
   `MarketDataProvider` interface.
5. **Free-tier budget awareness**: FMP's free tier is capped at
   **250 requests/day**, and there's no bulk endpoint on this tier (that
   needs FMP Ultimate, $149/mo — not happening yet). One full scan
   (breakout screen's ~32-symbol `SAMPLE_UNIVERSE` + sector rotation's 11
   ETFs + 1 SPY benchmark) is currently **~44 calls**. That leaves some
   room for a handful of manual test runs per day but not unlimited
   iteration — don't loop `pnpm run dev` refreshes carelessly while
   debugging the new provider, and consider testing against 1-2 symbols
   directly first (a throwaway script like the `debug-mp.ts` pattern used
   earlier this session — see the git log for `feat: redefine breakout
   screen around 150-day SMA cross` era commits for that pattern, though
   the script itself wasn't committed) before wiring it into the full app
   and burning a full-scan's worth of calls on every reload.
6. **Rate limiting**: replicate `yahooProvider.ts`'s batching pattern
   (`batchSize`/`delayMs` between batches in `getManyDailyHistories`) —
   FMP likely also throttles per-minute, not just per-day, so don't fire
   all ~44 requests concurrently.

### Verification approach

Same as the rest of this project: no automated test framework (deliberate
choice, see "Testing / verification" in
`docs/superpowers/specs/2026-08-23-web-frontend-design.md` if it's still
present, or just follow the existing pattern) — `tsc --noEmit` for
type-checking, plus manually running the app and confirming both `/api/breakout`
and `/api/sector-rotation` return sane data through the new provider.
Compare a couple of symbols' output against the current Yahoo-backed output
before fully cutting over, to catch any silent data-shape mismatches (the
reversed-array gotcha above being the most likely one).

### Open decision for next session

Whether to keep `YahooMarketDataProvider` around as a fallback/alternative
(e.g. selectable via an env var) or just delete it once FMP is confirmed
working. No strong opinion was set on this — ask the user, or default to
just replacing it cleanly (YAGNI) unless there's a reason to keep both.

## Why things are built the way they are

- **Data layer is an interface (`MarketDataProvider` in `types.ts`), not
  a concrete dependency.** Everything downstream (indicators, screens,
  the API server) only depends on that interface. This was deliberate:
  the free `yahoo-finance2` tier was for experimentation, with FMP as the
  intended upgrade once the screen logic was validated — see "Immediate
  next step" above, that day has arrived.
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
  (MP Materials, ticker `MP`, added to `SAMPLE_UNIVERSE` mid-session) that
  correctly falls into neither bucket: it crossed above its MA150 on
  light volume (1.14x vs. the 1.4x minimum) — the volume gate correctly
  excluded an unconfirmed cross, and it can't be "Approaching" either
  since it's already above the SMA post-cross. That's the volume filter
  doing its job, not a bug — but it's a real product gap worth knowing
  about: there's currently no third bucket for "crossed but not yet
  volume-confirmed." Not changed per explicit user decision
  ("leave for now") — revisit if it comes up again.
- **`SAMPLE_UNIVERSE` in `universe.ts`** has grown slightly since the
  original 30-symbol list (now ~32, with `CEG` and `MP` added by the
  user for testing) but is still a small hand-picked list, not the full
  S&P 500/Russell 1000. The FMP swap (above) doesn't require expanding
  this, but removes the main blocker (Yahoo's unofficial/rate-limited
  endpoint) to eventually doing so.
- **No backtesting harness exists yet.** Nothing replays the screen
  bar-by-bar over history to measure hit rate / false-positive rate.
  Still the most important step before trusting live output for real
  decisions.
- **No persistence.** Every page load is a stateless fresh scan —
  nothing is stored, so there's no way yet to track how a flagged setup
  performed after the signal fired.
- **`yahoo-finance2` is still the active provider as of this handoff**
  (an unofficial/reverse-engineered API, prone to occasional rate
  limiting — observed directly this session, HTTP 429 from
  `query2.finance.yahoo.com`) — the FMP swap above is the fix for this.

## Data provider decision (updated context)

Originally decided against building on FMP immediately because the
**bulk EOD endpoint** needed to scan a broad universe efficiently is only
on FMP's Ultimate tier ($149/mo); Starter ($22/mo) gets real-time + 5yr
history but still requires per-symbol calls; the free tier is 250
calls/day with per-symbol calls only. That calculus hasn't changed — the
free tier is still per-symbol-call-only — but the user now has a free-tier
key and wants it plugged in regardless, presumably to get off Yahoo's
rate-limited unofficial endpoint even without the bulk-scan upgrade.
Revisit FMP Starter/Ultimate once usage patterns under the free tier are
understood.

## Suggested next steps, roughly in order

1. **Plug in FMP** (see "Immediate next step" above) — the explicit ask
   for the next session.
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

## Loose ends from this session (not yet resolved, low priority)

- `src/universe.ts` has an **uncommitted local edit** (adding `CEG` and
  `MP` to `SAMPLE_UNIVERSE`) sitting in the working tree as of this
  handoff — the user added `MP` to investigate the breakout-screen gap
  described above. Not committed because it wasn't clear whether it
  should be treated as permanent universe expansion or a one-off test
  edit — ask before committing or discarding it.
- `.vscode/launch.json` (an F5 launch config running `pnpm run dev`) is
  also **untracked** — created during this session, never committed;
  same story, ask the user or just commit it, low stakes either way.
- Both of the above are harmless to leave as-is; flagging so a fresh
  session doesn't mistake them for accidental/unexplained changes.

## File map

```
src/
  types.ts                        MarketDataProvider interface, shared result/API-response types
  data/
    yahooProvider.ts               Only file that knows about Yahoo specifically (to be joined/replaced by fmpProvider.ts)
  indicators/
    movingAverage.ts               SMA, highest/lowest high
    volatility.ts                  Range contraction ("heartbeat"), volume ratio
    relativeStrength.ts            RS vs benchmark, money flow score
  screens/
    breakoutScreen.ts              150-day SMA cross + heartbeat consolidation + volume trigger
    sectorRotationScreen.ts        Ranks 11 SPDR sector ETFs by RS + money flow
  universe.ts                      Sample ticker list (see "Loose ends" — has an uncommitted edit)
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
  specs/2026-08-23-web-frontend-design.md   The design spec this whole rewrite implemented
  plans/2026-08-23-web-frontend-implementation.md   The 9-task implementation plan (all done)
```
