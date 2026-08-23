# Design: Mansfield RS-based sector rotation, simplified

## Problem

The sector rotation screen currently ranks the 11 SPDR sector ETFs by plain relative strength (return diff vs SPY) over a 3-month lookback, and separately shows a Chaikin-style money-flow accumulation/distribution read. This works, but:

1. Plain return-diff RS is a blunt rotation signal — it doesn't distinguish a sector that's been outperforming steadily from one whose outperformance is decelerating (or vice versa for underperformers).
2. The screen shows three separate RS windows (1m/3m/6m) and a raw money-flow read, but doesn't answer the actual question the screen exists for: "which sectors are accumulating institutional capital right now?"

## Solution

Replace the plain RS ranking with **Mansfield Relative Strength** (Stan Weinstein's RS oscillator), and combine it with the existing money-flow read into an explicit "capital flow" verdict. Drop the now-superseded plain 1m/3m/6m RS fields entirely — they're used nowhere else in the codebase (confirmed: `relativeStrength()`/`periodReturnPct()` and `relativeStrength1m/3m/6m` are referenced only by this screen and its view).

### Mansfield RS

For each sector ETF, compute the ratio series `sectorClose[i] / benchmarkClose[i]` for each bar `i` (aligned positionally, matching this file's existing convention — see "Known limitation" below). Take a 200-period simple moving average of that ratio series, then:

```
mansfieldRs = ((ratio[last] / sma(ratio, 200)) - 1) * 100
```

This measures how far the sector's current relative-strength ratio sits above/below its own 200-day trend — a momentum-of-relative-strength read, not a raw return diff. Positive means the sector's outperformance (or underperformance) vs SPY is currently accelerating relative to its own recent trend; negative means decelerating. Zero-crossings are the classic Weinstein rotation signal.

200-day was chosen (not the classical weekly-chart 52-week window) because this app only fetches daily EOD data, and 200 days is a standard daily-data adaptation. It fits within the existing 400-calendar-day fetch window with margin (already sized for the breakout screen's 150-day SMA), so no change to how much history is fetched.

Returns `NaN` if fewer than 200 bars are available, handled the same way the existing NaN cases are (sorts to the bottom of the ranking).

### Combined "capital flow" classification

The existing money-flow score/classification (`moneyFlowScore` → `classifyMoneyFlow`, Chaikin-style accumulation/distribution proxy) is kept as-is — it's a genuinely different signal (volume-weighted, intraday-range-based) and remains useful on its own.

A new `classifyCapitalFlow(mansfieldRs, moneyFlowTrend)` combines both signals:

| Mansfield RS | Money flow | Capital flow |
|---|---|---|
| > 0 | `accumulation` | `accumulating` |
| < 0 | `distribution` | `distributing` |
| anything else (including disagreement, or either signal NaN/neutral) | | `neutral` |

A sector is only flagged as accumulating (or distributing) capital when both an independent momentum signal (Mansfield RS) and an independent volume-weighted signal (money flow) agree — disagreement is a genuinely informative "neutral/mixed" state, not an error.

### Ranking

Sectors are ranked by `mansfieldRs` descending (rank 1 = strongest, matching the existing "rank 1 = strongest rotation-in" convention), replacing the current sort by `relativeStrength3m`. NaN sectors sort to the bottom via the same `-Infinity` fallback pattern already used.

## Changes by file

**`src/indicators/relativeStrength.ts`**
- Remove `periodReturnPct()` and `relativeStrength()` (unused once nothing computes plain RS).
- Add `mansfieldRelativeStrength(symbolBars, benchmarkBars, period = 200, endIndex?)`.
- Add `classifyCapitalFlow(mansfieldRs, moneyFlowTrend)`.
- Keep `moneyFlowScore()` and `classifyMoneyFlow()` unchanged.

**`src/screens/sectorRotationScreen.ts`**
- Remove `TRADING_DAYS_1M/3M/6M` constants and the three `relativeStrength(...)` calls.
- Add a `MANSFIELD_RS_PERIOD = 200` constant and the `mansfieldRelativeStrength(...)` call.
- Compute `capitalFlow` via `classifyCapitalFlow(mansfieldRs, moneyFlowTrend)`.
- Change the sort to rank by `mansfieldRs` instead of `relativeStrength3m`.

**`src/types.ts`**
- `SectorRotationResult`: remove `relativeStrength1m/3m/6m`; add `mansfieldRs: number` and `capitalFlow: "accumulating" | "distributing" | "neutral"`.

**`client/src/types.ts`**
- Mirror the same field changes (this file already duplicates the server's response shape for the client).

**`client/src/views/SectorRotationView.vue`**
- Table becomes: `# | Sector | Mansfield RS | Money flow | Capital flow`.
- Remove the RS 1m/3m/6m columns and their table headers.
- Add a "Mansfield RS" column (numeric, reusing the existing `rsClass()` pos/neg coloring helper).
- Add a "Capital flow" column, styled the same way the existing "Money flow" column is (reuse/extend the `.flow` CSS class pattern for the three new value strings `accumulating`/`distributing`/`neutral` — distinct from the existing `moneyFlowTrend` values `accumulation`/`distribution`/`neutral` already styled, so the CSS selectors need matching new/adjusted class names, not a clash).

## Known limitation (pre-existing, not introduced by this change)

Symbol and benchmark bar arrays are compared positionally (`bars[i]` vs `benchmarkBars[i]`), not matched by date. This is already true of every calculation in `relativeStrength.ts` today (the plain `relativeStrength()` being removed had the same assumption) — not a new gap introduced here, and fixing it (date-aligning all fetched histories) is a broader change out of scope for this task.

## Testing

No automated test framework in this project (existing, deliberate choice). Verification is `tsc --noEmit` (both server and client) plus a manual check: run `/api/sector-rotation` against live data, confirm `mansfieldRs` values are plausible (roughly ±20 for most sectors, occasional larger swings), confirm the ranking order reflects `mansfieldRs` rather than the old 3-month RS, and spot-check a couple of sectors' `capitalFlow` values against their own `mansfieldRs` sign and `moneyFlowTrend` to confirm the combination logic. Also visually confirm the simplified table renders correctly (5 columns, no leftover references to the removed RS columns).

## Out of scope

- No change to the money-flow calculation itself (`moneyFlowScore`/`classifyMoneyFlow`), only how it's combined with the new signal.
- No date-alignment fix for symbol/benchmark bar arrays (see Known limitation above).
- No change to the breakout screen or its indicators — this is scoped entirely to sector rotation.
