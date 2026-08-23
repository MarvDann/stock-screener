# Handoff: Stock Screener

Context for picking this up in Claude Code. Written so a fresh session
(or a fresh person) can get oriented without re-deriving the design
decisions from scratch.

## What this is

Two screens over daily EOD data:

1. **Breakout screen** — Minervini-style Stage-2 trend template (above
   rising 150/200-day SMAs, near 52-week highs) + a volatility-contraction
   ("heartbeat") consolidation check + a volume-confirmed breakout trigger.
2. **Sector rotation screen** — ranks the 11 SPDR sector ETFs by relative
   strength vs SPY (1m/3m/6m) plus a simple accumulation/distribution
   money-flow read, as a proxy for where institutional money is rotating.

Plus a **near-breakout** variant of screen 1 (passes trend + consolidation
but hasn't triggered yet) that renders an HTML report with an SVG price
chart per candidate, since reading numbers alone doesn't tell you if a
pattern actually looks like a real consolidation.

## Why things are built the way they are

- **Data layer is an interface (`MarketDataProvider` in `types.ts`), not
  a concrete dependency.** Everything downstream (indicators, screens,
  reports) only depends on that interface. The only file that knows about
  Yahoo specifically is `data/yahooProvider.ts`. This was deliberate: we
  started on the free tier for experimentation and expect to swap to a
  paid provider (FMP Starter/Ultimate, or Polygon) once the screen logic
  is validated — that should mean writing one new file, not touching
  indicators or screens.
- **`yahoo-finance2` is pinned to v4**, not v2 (which is EOL). The v4 API
  requires an instantiated `new YahooFinance()` client and an explicit
  `return: "array"` on `.chart()` calls — get this wrong and TypeScript
  will complain about `Property 'quotes' does not exist on type 'never'`.
- **Screen logic is fully deterministic** (plain moving-average / range
  math), not LLM-judged. This was an explicit choice so it's backtestable
  and reliable — an LLM ranking/summary layer on top was discussed as a
  possible later addition, not built.
- **No dependency was added for charting.** `report/svgChart.ts` hand-builds
  SVG path strings rather than pulling in Chart.js or similar, to keep the
  report self-contained (one HTML file, no build step, no CDN dependency).

## Known limitations / things not yet validated

- **Never run against real data end-to-end.** This was built and
  type-checked in a sandboxed environment with network egress locked to
  package registries only — Yahoo's endpoint (`query2.finance.yahoo.com`)
  was unreachable from there. All logic was verified by (a) `tsc --noEmit`
  type-checking cleanly and (b) a synthetic-data smoke test (fabricated
  OHLCV bars shaped like an uptrend-into-consolidation) confirming the
  near-breakout screen and chart/report pipeline produce sane output. It
  has **not** been confirmed against real market data — that's the first
  thing to do.
- **Breakout screen returning zero results has not been diagnosed against
  real data.** The user reported seeing no breakouts on the initial run;
  a `--verbose` flag was added to `index.ts` to show per-symbol
  pass/fail on each of the three conditions, but the actual verbose
  output was never reviewed together — that's an open thread. Zero full
  breakouts on a 30-stock sample on any given day is plausible on its
  own (all three conditions rarely align simultaneously), but it hasn't
  been distinguished from "thresholds too strict" or "data issue."
- **Default thresholds in `DEFAULT_BREAKOUT_CONFIG` (breakoutScreen.ts)
  are starting points, not backtested values.** Consolidation window
  (15d), prior comparison window (40d), max % off 52-week high (25%),
  breakout volume ratio (1.4x) — all worth tuning once real signals can
  be compared against what actually happened afterward.
- **`SAMPLE_UNIVERSE` in `universe.ts` is 30 hand-picked large-caps**,
  not the full S&P 500/Russell 1000. Fine for validating logic; too
  narrow for a real daily scan.
- **No backtesting harness exists yet.** Nothing replays the screen
  bar-by-bar over history to measure hit rate / false-positive rate.
  This is the most important next step before trusting live output.
- **No persistence.** Every run is stateless — nothing is stored, so
  there's no way yet to track how a flagged setup performed after the
  signal fired.
- **yahoo-finance2 is an unofficial/reverse-engineered API.** Fine for
  experimentation; expect it to occasionally break or get rate-limited,
  and don't build a production product on it long-term (see the FMP
  pricing discussion below for the intended upgrade path).

## Data provider decision (for context)

Discussed and decided against building on FMP immediately: FMP's free
tier is 250 calls/day (fine for ~500 symbols/day with care), but the
**bulk EOD endpoint** needed to scan a broad universe efficiently is only
on FMP's Ultimate tier ($149/mo). Starter ($22/mo) gets real-time + 5yr
history but still requires per-symbol calls. Decision: use free
`yahoo-finance2` for the experimentation phase (current state), and
reassess FMP Starter or Ultimate once the screen logic is validated and
scan frequency/universe size is settled. Not yet revisited.

## Suggested next steps, roughly in order

1. Run `npm install && npm run dev -- --verbose` against real data and
   actually look at the per-symbol breakdown — resolve the "zero
   breakouts" open thread.
2. Build a backtest harness: replay the screen day-by-day over 1-2 years
   of history for the sample universe, log every trigger, and check
   forward returns (e.g. 5/10/20 days later) to see if the signal has
   any edge before trusting it live.
3. Expand `SAMPLE_UNIVERSE` toward the full S&P 500 (a static list is
   fine to start — dynamically fetching constituents is a later nicety).
4. Add persistence (SQLite is enough) so scan results and their forward
   performance can be tracked over time.
5. Revisit the FMP-vs-Yahoo decision once scan frequency and universe
   size are settled.

## File map

```
src/
  types.ts                        MarketDataProvider interface, shared result types
  data/yahooProvider.ts           Only file that knows about Yahoo specifically
  indicators/
    movingAverage.ts              SMA, slope, highest/lowest high, % off high
    volatility.ts                 Range contraction ("heartbeat"), volume ratio
    relativeStrength.ts           RS vs benchmark, money flow score
  screens/
    breakoutScreen.ts             Trend template + consolidation + trigger;
                                   also scanForNearBreakouts (candidates, not yet triggered)
    sectorRotationScreen.ts       Ranks 11 SPDR sector ETFs by RS + money flow
  report/
    svgChart.ts                   Dependency-free SVG price chart renderer
    htmlReport.ts                 Builds the near-breakout HTML report
  universe.ts                     Sample 30-symbol ticker list
  index.ts                        Entry point; runs all three screens, writes the report
```
