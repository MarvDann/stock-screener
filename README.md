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

The data layer defaults to Financial Modeling Prep (FMP), so a `FMP_API_KEY`
is required in `.env` before running — see the `.env` section in
`HANDOFF.md` for details. To run without an FMP key instead, set
`DATA_PROVIDER=yahoo` in `.env` to use the free `yahoo-finance2` fallback
(no API key, but unofficial and rate-limited).

## Project structure

```
src/
  types.ts                     Shared interfaces (bars, provider, results)
  data/
    fmpProvider.ts             Default data provider (requires FMP_API_KEY)
    yahooProvider.ts           Free fallback provider (DATA_PROVIDER=yahoo)
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
depends on that interface, not on any specific API. `src/server.ts`
selects the provider via the `DATA_PROVIDER` env var (`fmp` or `yahoo`,
default `fmp`): `FmpMarketDataProvider` is the default and requires
`FMP_API_KEY`; `YahooMarketDataProvider` is a free, no-key fallback
(`DATA_PROVIDER=yahoo`) with no daily quota but unofficial/rate-limited
behavior. To add another provider, implement the same interface
(`getDailyHistory`) against the new API and wire it into `src/server.ts`
— no changes needed to indicators or screens.

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
