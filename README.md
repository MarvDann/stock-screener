# Stock Screener

Two screens, built to be run daily on end-of-day data:

1. **Breakout screen** — flags stocks that are (a) in a Stage-2 uptrend
   (Minervini-style trend template: above rising 150/200-day SMAs, near
   52-week highs), (b) have been in a tight consolidation ("heartbeat")
   with a shrinking trading range, and (c) have just broken above the top
   of that range on above-average volume.
2. **Sector rotation screen** — ranks the 11 SPDR sector ETFs by relative
   strength vs SPY over 1/3/6-month windows, plus a simple money-flow
   (accumulation/distribution) read, to show which sectors institutional
   money is rotating into or out of.

## Setup

```bash
npm install
npm run dev      # runs directly via ts-node against the sample universe
# or
npm run build && npm start
```

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
    breakoutScreen.ts          Combines trend template + contraction + trigger
    sectorRotationScreen.ts    Ranks sector ETFs by RS + money flow
  universe.ts                  Starter ticker list — swap for full S&P 500
  index.ts                     Runs both screens, prints results
```

## Swapping the data provider

Everything downstream of `MarketDataProvider` (in `types.ts`) only depends
on that interface, not on Yahoo specifically. To move to FMP or Polygon
later, implement the same interface (`getDailyHistory`) against the new
API and swap the import in `index.ts` — no changes needed to indicators
or screens.

## Tuning the breakout screen

Defaults live in `DEFAULT_BREAKOUT_CONFIG` in `breakoutScreen.ts`:

- `consolidationPeriod` (15 days) / `priorPeriod` (40 days) — the two
  windows compared to confirm the trading range is actually contracting,
  not just narrow by chance.
- `maxPctOffHigh` (25%) — how close to the 52-week high a stock must be
  to count as "under accumulation" rather than just technically above
  its moving averages.
- `minBreakoutVolumeRatio` (1.4x) — how much above average volume the
  breakout day needs to be to count as a real trigger vs noise.

These are starting points, not tuned values — backtest against your own
universe and adjust before trusting the output.

## Next steps

- Expand `SAMPLE_UNIVERSE` to the full S&P 500 / Russell 1000.
- Add a backtesting harness that replays the screen bar-by-bar over
  historical data to measure hit rate and false-positive rate before
  trusting live signals.
- Persist daily scan results (SQLite/Postgres) so you can track how
  flagged setups perform after the signal fires.
- Consider an optional LLM ranking/summary layer on top of the
  deterministic screen output, once the screen itself is validated.
