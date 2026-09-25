# Stock Screener

A local web app with two screens, run on-demand against live end-of-day data:

1. **Breakout screen** — flags stocks that have just crossed above their
   150-day SMA (within the last 3 trading days) after a tight consolidation
   ("heartbeat") on above-average volume ("Triggered"), plus stocks still
   consolidating just below their 150-day SMA and within 5% of it
   ("Approaching"). Results are sorted by relevance and paginated.
2. **Sector rotation screen** — ranks the 11 SPDR sector ETFs by relative
   strength vs SPY over 1/3/6-month windows, plus a simple money-flow
   (accumulation/distribution) read, to show which sectors institutional
   money is rotating into or out of.

The stock universe covers ~366 S&P 500 constituents.

## Setup

```bash
pnpm install
pnpm --dir client install
```

Create a `.env` file in the project root:

```
FMP_API_KEY=your-key-here
DATA_PROVIDER=yahoo
JWT_SECRET=some-random-secret
```

`DATA_PROVIDER` can be `yahoo` (free, no key needed) or `fmp` (requires
an API key from financialmodelingprep.com). `JWT_SECRET` is used to sign
authentication tokens — use a long random string in production.

## Running

```bash
pnpm run dev
```

This starts the Express API server (port 3001) and the Vite dev server
(port 5173) together. Open `http://localhost:5173` in a browser — you'll
be prompted to register or log in before accessing the screens.

## Auth

The app uses email/password authentication with JWT tokens. Register an
account on first use. Sessions last 7 days. User data is stored in a
local SQLite database (`data/screener.db`, gitignored).

## Database

Users and the tracked ticker list live in `data/screener.db` (gitignored).

- **Seeding:** a fresh database is seeded from `src/seed/tickers.json` —
  every ticker with its name, sector, sub-sector and currency. Seeding only
  happens when the table is first created; an existing database is never
  touched.
- **Updating the seed:** after changing the ticker list in the app, run
  `pnpm run db:export-seed` and commit `src/seed/tickers.json` so new setups
  start from the same list. User accounts are never exported.
- **Backups:** `pnpm run db:backup` writes a consistent snapshot (tickers
  and users) to `data/backups/`, safe while the server is running. To
  restore, stop the server and copy a backup over `data/screener.db`.

## Tests

```bash
pnpm test
```

Runs the Vitest suite covering indicators, screens, and auth.
