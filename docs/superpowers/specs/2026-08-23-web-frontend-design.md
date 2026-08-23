# Web frontend for the stock screener

Date: 2026-08-23

## Purpose

Replace console/CLI output and the static near-breakout HTML report with a
real local web app: a Vue frontend backed by a small Express API that wraps
the existing screen logic. This also folds in a redefinition of the breakout
screen itself (see "Breakout screen (new definition)" below), which was
raised and settled during this same design session.

## Usage model

Local, on-demand. The user starts the app on their own machine (`npm run
dev` starts both the API server and the Vite dev server); there is no
deployment, scheduling, or multi-user concern. Each page fetches fresh data
from the API on load — no persistence, no caching of prior scan results.
A manual "Refresh" control re-triggers the same fetch without a full page
reload.

## Architecture

- **`src/` stays the domain layer** (indicators, `data/yahooProvider.ts`,
  `universe.ts`) — untouched in shape, though `screens/breakoutScreen.ts`
  gets rewritten per the new definition below.
- **New Express API server** (`src/server.ts`) replaces `index.ts`'s current
  CLI-printing role as the entry point. Two endpoints:
  - `GET /api/breakout` — runs the (rewritten) breakout screen against
    `SAMPLE_UNIVERSE`, returns `{ triggered: Candidate[], approaching:
    Candidate[], warnings: string[] }`.
  - `GET /api/sector-rotation` — runs `sectorRotationScreen`, returns the
    ranked list of the 11 SPDR sector ETFs.
  - Each `Candidate` includes symbol, the metrics relevant to why it
    qualified, and a slice of recent OHLCV bars (enough for the chart —
    on the order of 90-120 daily bars) for client-side rendering.
- **New `client/` directory** — Vue 3 (Composition API, `<script setup>`)
  + Vite + `vue-router`. Two routes:
  - `/breakout` — the combined Breakout page (see below).
  - `/sector-rotation` — the ranked sector table.
  - Sidebar navigation between the two. No Pinia/Vuex — page-level fetch
    on mount is enough for this scope; no cross-page shared state exists.
- **Charting**: `lightweight-charts` (TradingView's library) renders a
  price chart per candidate card, replacing the hand-rolled SVG chart in
  `report/svgChart.ts`.
- **Dev workflow**: root `package.json` gets a `dev` script using
  `concurrently` to run the API server (`tsx watch src/server.ts`) and the
  Vite dev server together. Vite proxies `/api/*` to the Express server so
  there's no CORS configuration needed.

## Pages

### Breakout (`/breakout`)

One page, two sections, both rendered as a card grid (one card per
candidate, each with a price chart and its qualifying metrics):

- **Triggered** — candidates that fired the breakout trigger (see below).
- **Approaching** — candidates nearing the trigger but not there yet.

This replaces what used to be two separate concepts (the CLI's breakout
screen and the separate near-breakout HTML report) with one page.

### Sector Rotation (`/sector-rotation`)

Unchanged in substance from the current `sectorRotationScreen` output: a
ranked table of the 11 SPDR sector ETFs by relative strength vs. SPY
(1m/3m/6m) and a money-flow read, rendered as a table rather than cards
(it's a ranking, not a per-symbol pattern to eyeball).

## Breakout screen (new definition)

This replaces the current Stage-2 trend-template + prior-range-high
trigger logic in `screens/breakoutScreen.ts` with a simpler definition
centered on the 150-day SMA, while keeping the existing heartbeat
(tight-range consolidation) check as a required component of both states.

- **Approaching**: price is below the 150-day SMA, within 5% of it
  (`(MA150 − close) / MA150 ≤ 0.05`), **and** the stock is currently in a
  heartbeat consolidation (reusing the existing tight-range-vs-prior-range
  check unchanged — 15-day consolidation window vs. 40-day prior window,
  same defaults as today).
- **Triggered**: price closed above the 150-day SMA within the last 3
  trading days (i.e., it was below MA150 at some point in the prior 3
  bars and is above it now), **and** the same heartbeat consolidation
  check used for Approaching evaluates true using its normal windows
  (15-day consolidation / 40-day prior) anchored to end on the bar
  immediately before the cross day, **and** the current day's volume is
  ≥ 1.4x its 20-day average (reusing the existing volume-ratio helper in
  `indicators/volatility.ts` unchanged).

**Dropped** from the current logic: the Stage-2 trend template (200-day
SMA / rising-slope requirement, price-above-both-MAs check) and the
52-week-high-proximity + prior-range-high breakout trigger. This code
should be deleted from `screens/breakoutScreen.ts`, not left dangling.

**Kept as-is**: the heartbeat consolidation function and the volume-ratio
helper in `indicators/volatility.ts` — both get reused, just wired to the
150-day MA cross instead of a range breakout. `movingAverage.ts`'s SMA
helper is reused for the 150-day MA (already exists).

`sectorRotationScreen.ts` and `indicators/relativeStrength.ts` are
unaffected by this change.

## What gets retired

- `report/svgChart.ts` and `report/htmlReport.ts` — superseded by the Vue
  card grid + `lightweight-charts`.
- `output/` directory and its generated `near-breakout-report.html` —
  no longer produced.
- The CLI's console-table printing path in the current `index.ts` — the
  entry point becomes the API server bootstrap instead. (`index.ts`'s
  screen-orchestration logic moves into `src/server.ts`'s route handlers;
  nothing is preserved as a standalone CLI in v1.)

## Universe

Stays `SAMPLE_UNIVERSE` (~30 hand-picked large-caps) for v1, unchanged
from today. A full-market scan isn't practical yet on the free Yahoo API
(per-symbol calls, rate-limited) — that's deferred until the FMP
bulk-endpoint upgrade already discussed in `HANDOFF.md` is revisited.
Expanding the static list (e.g. toward S&P 500) is possible later without
architectural change, but out of scope here since "fresh scan on every
page load" needs to stay fast.

## Error handling

- **Per-symbol fetch failure**: the API includes it in the `warnings`
  array (e.g. `"Skipped XYZ: fetch failed"`) instead of silently dropping
  it. The frontend shows a small dismissible banner listing any warnings
  above the results.
- **Whole-scan failure** (e.g. Yahoo unreachable): the endpoint returns a
  non-2xx response with an error message; the frontend shows a "Scan
  failed — try again" state in place of the card grid/table, with a retry
  action.

## Testing / verification

No new test framework is introduced solely for this feature. Verification
is manual: run `npm run dev`, confirm both pages load live data from
Yahoo, confirm the Triggered/Approaching split and sector ranking look
sane against a few known symbols, and confirm the warning/error states
by temporarily forcing a bad symbol or network failure. This matches how
the project has been verified so far (type-checking + synthetic smoke
test); a real automated test suite for the new screen logic and API layer
is a reasonable fast-follow but not required for v1.

## Out of scope (unchanged from HANDOFF.md)

- Backtesting harness.
- Persistence / historical tracking of scan results.
- Full S&P 500 / Russell 1000 universe.
- Swapping the data provider away from `yahoo-finance2`.

These remain open items independent of this frontend work.
