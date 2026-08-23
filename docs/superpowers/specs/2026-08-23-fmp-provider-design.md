# FMP data provider

Date: 2026-08-23

## Purpose

Replace `yahoo-finance2` (an unofficial, occasionally-rate-limited API — HTTP
429 observed directly from `query2.finance.yahoo.com`) as the active market
data source with Financial Modeling Prep (FMP), for which the user now has a
free-tier API key. `MarketDataProvider` (`src/types.ts`) was built as an
interface specifically to make this swap contained and mechanical — no
changes needed to indicators, screens, or the API response shapes.

## API research: superseding HANDOFF.md

`HANDOFF.md` pointed at FMP's legacy `v3` endpoint
(`GET /api/v3/historical-price-full/{symbol}`, response nested as
`{ symbol, historical: [...] }`). A live test call against the account's
actual free-tier key during this session's brainstorming confirmed that
endpoint shape is stale — FMP's current API surface is a separate `stable`
namespace:

```
GET https://financialmodelingprep.com/stable/historical-price-eod/full?symbol={symbol}&from={YYYY-MM-DD}&to={YYYY-MM-DD}&apikey={key}
```

Confirmed response (flat array, **newest-first** — reversal is still
required before mapping to `DailyBar[]`, same underlying gotcha
`HANDOFF.md` flagged, just against a different response shape):

```json
[
  {
    "symbol": "AAPL",
    "date": "2026-08-21",
    "open": 312.05,
    "high": 312.38,
    "low": 307.01,
    "close": 309.35,
    "volume": 46876815,
    "change": -2.7,
    "changePercent": -0.865,
    "vwap": 310.2
  }
]
```

Only `date`/`open`/`high`/`low`/`close`/`volume` map to `DailyBar`;
`symbol`/`change`/`changePercent`/`vwap` are dropped. Unlike the legacy `v3`
shape, there is no `adjClose` field on this endpoint.

On auth failure the endpoint returns HTTP 401 with
`{ "Error Message": "..." }` — that message should be surfaced in thrown
errors instead of a generic "fetch failed", since a bad/missing key
otherwise looks identical to 44 unrelated per-symbol data failures.

The 250-requests/day free-tier cap (confirmed via FMP's docs, not
endpoint-specific) is unchanged from `HANDOFF.md`'s existing analysis: one
full scan (32-symbol `SAMPLE_UNIVERSE` + 11 sector ETFs + SPY benchmark) is
still ~44 calls, one per symbol, since the free tier has no bulk endpoint.

## Architecture

- **`src/data/fmpProvider.ts`** (new) — `FmpMarketDataProvider implements
  MarketDataProvider`, mirroring `yahooProvider.ts`'s shape:
  - `getDailyHistory(symbol, lookbackDays)`: computes `from = today −
    lookbackDays` and `to = today` (same calendar-day-lookback pattern as
    `yahooProvider.ts`'s `period1`/`period2`), calls the `stable` endpoint
    via Node's built-in `fetch`, reverses the response array, maps to
    `DailyBar[]`.
  - `getManyDailyHistories(symbols, lookbackDays, batchSize = 10, delayMs =
    300)`: same batching shape as `yahooProvider.ts` (sequential batches
    with a delay between them, since FMP's per-minute throttle isn't
    documented for the free tier and shouldn't be assumed unlimited). Same
    per-symbol `try/catch` → `{ symbol, bars: [] }` failure contract
    `server.ts` already relies on to build its `warnings` list — preserved
    exactly.
  - Constructor throws immediately if `process.env.FMP_API_KEY` is unset —
    fail fast at startup rather than producing 44 silent per-symbol
    warnings from unauthenticated requests.
- **Provider selection in `src/server.ts`**: a `DATA_PROVIDER` env var
  (`"fmp"` default, `"yahoo"` as the explicit alternative) picks which
  provider gets instantiated — a small `if`/`switch`, not a factory
  abstraction. `YahooMarketDataProvider` and the `yahoo-finance2` dependency
  both stay in the codebase as a selectable fallback (explicit user
  decision — not deleted, in case the 250 req/day free tier ever feels too
  limiting for a given session).

## Config

- `.env` at the project root (already created this session, already
  gitignored, already populated with `FMP_API_KEY` by the user) holds
  `FMP_API_KEY` and optionally `DATA_PROVIDER=fmp`.
- `package.json`'s `dev:server` and `start` scripts get `--env-file=.env`
  added to their `tsx`/`node` invocations (Node 24 confirmed available, no
  `dotenv` dependency needed).

## Error handling

- Non-2xx FMP responses: parse the `Error Message` field when present and
  include it in the thrown error, so auth/quota failures are distinguishable
  from network errors in server logs.
- Per-symbol fetch failures (network error, non-2xx, empty response) are
  caught in `getManyDailyHistories` exactly as `yahooProvider.ts` does today
  — logged via `console.error`, symbol contributes `{ symbol, bars: [] }`,
  and `server.ts`'s existing `warnings` construction picks it up unchanged.

## Testing / verification

No automated test framework in this project (deliberate, existing
convention). Verification is:

1. `tsc --noEmit` for type-checking.
2. Manually run the app with `DATA_PROVIDER=fmp` and confirm both
   `/api/breakout` and `/api/sector-rotation` return sane data.
3. Spot-check a couple of symbols' output against the current
   Yahoo-backed output (toggle `DATA_PROVIDER=yahoo` back to compare) to
   catch any remaining silent data-shape mismatch.
4. Budget awareness: one live FMP call was already spent during this
   session's brainstorming (verifying the response shape above), out of
   the 250/day cap. Full-app verification runs (~44 calls each) should be
   limited to a handful, not looped carelessly.

## Out of scope

- Expanding `SAMPLE_UNIVERSE` beyond its current ~32 symbols.
- A backtesting harness.
- Persistence of scan results.
- The "crossed but not volume-confirmed" breakout-screen gap noted in
  `HANDOFF.md`.

All unchanged from `HANDOFF.md`'s existing prioritization — this spec is
scoped to the provider swap only.
