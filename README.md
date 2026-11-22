# Stock Screener

A local web app for screening and charting stocks against live end-of-day
data: Minervini-style breakouts, sector and industry group rotation, market
breadth, earnings and volatility. Scans run on demand.

![Home dashboard in the matrix theme](docs/images/home.png)

The tracked universe is ~870 tickers: S&P 500 constituents plus the
competitors that fill out their industry groups. It's managed from the
**Tickers** page (see [Database](#database)).

## Pages

**Home** is a market dashboard: index tiles (S&P 500, Nasdaq-100,
Russell 2000, Dow, FTSE All-World, FTSE 100) with sparklines, market breadth
for the tracked universe, the leading and lagging sectors, the day's top
movers and the latest breakouts.

**Breakout** applies Mark Minervini's method. Stocks must pass his Trend
Template (stacked, rising 50/150/200-day SMAs, at least 30% off the 52-week
low, within 25% of the high). His eighth criterion, an RS Rating of 70 or
more, is switched off for now: ratings rank only the tracked tickers, so
they're shown but not filtered on.
It then looks for a volatility contraction pattern (2–6 progressively
smaller pullbacks, the last one under 10% deep on drying-up volume) in a flat
base, heartbeat, cup with handle (cup no deeper than 25%) or low cheat (a
tight pause anywhere in a cup below the handle area). The pivot is the
resistance level of the final contraction: its high, unless a few days spike
above a level price then falls back under and keeps testing. The cup's
left-side high ignores spikes the same way.
"Triggered" stocks closed above it in the last 3 trading days; cards flag
breakouts on light volume (under 40% above average) or extended more than 5%
past the pivot. "Approaching" stocks are within 5% below it. Results are
sorted by relevance and paginated.

**Sector Rotation** ranks the 11 SPDR sector ETFs by relative strength vs
SPY over 1/3/6-month windows, plus a simple money-flow
(accumulation/distribution) read, to show which sectors institutional money
is rotating into or out of. Each row links to the sector's ETF chart and its
stocks.

**Sector Drilldown** browses sector → sub-sector → stocks, with each
sector's ETF trend line and latest-day breadth for every group.

**Industry Groups** ranks industry groups by their stocks' short-term
relative strength: each stock's 1- and 3-month performance as a percentile of
the tracked universe, averaged. The top 10 groups with at least 5 rated
stocks are shown, each with its leader and closest competitors, their RS,
distance from the 52-week high, Stage 2 status and breakout setup. A ticker
can be given a custom group (e.g. Cybersecurity) on the Tickers page, ranked
in place of Yahoo's industry, which lumps groups like security software in
with the rest of software.

**Stock Charts** shows every tracked ticker as a chart card, searchable and
filterable by sector.

**Stock detail** (click any stock) has a candlestick chart with 50 and
150-day SMAs, volume and an OHLCV readout, switchable between daily, weekly
and monthly bars (weekly and monthly use 10 and 30-bar SMAs). Below it are
the breakout screen's read on the stock (pattern, pivot, base, contractions,
RS), financials (margins, free cash flow, debt/equity, P/E), trailing EPS,
a company overview and recent news.

**Earnings** lists the tracked companies reporting today and over the next 7
days, grouped by day, with each report's time (in your local time) and
whether it lands before the open, during the session, or after the close.
Dates come from Yahoo; ones a company hasn't confirmed yet are marked
"Estimated".

**Volatility** tracks the VIX alongside its 9-day and 3-month siblings and
the VVIX: today's level and how it compares with the past year, whether the
volatility curve is inverted (VIX above VIX 3-month, typical of sell-offs),
and line charts over 1 month to 1 year.

**ETFs** charts a curated list of ETFs by category. Use **Edit list** to
add, rename, recategorise or remove them. New symbols are checked against the
data provider, and their currency is looked up. The US Sectors group is
fixed: it's the 11 SPDR funds the Sector Rotation page ranks. The list lives
in the database (and so in `pnpm run db:backup`), starting from the curated
set in `src/etfs.ts` on a fresh install.

**Watchlists** let each user group stocks and ETFs into named lists and
chart them together. Create and manage them on the Watchlists page, or use
the Watchlists menu on any stock's page to add or remove it. Each account's
watchlists are private to it. A watchlist can hold any tracked ticker or
curated ETF.

**Tickers** adds, renames and removes tracked tickers, showing each one's
sector and sub-sector (looked up from Yahoo) and its custom group.

Page filters, tabs, page numbers and the chart timeframe live in the URL, so
the back button, reloads and shared links restore them. Prices show in their
trading currency (London prices quoted in pence are converted to pounds).
The app has dark, light and matrix themes.

## Setup

```bash
pnpm install
pnpm --dir client install
```

Create a `.env` file in the project root:

```
JWT_SECRET=some-random-secret
```

Market data comes from Yahoo Finance (free, no API key needed).
`JWT_SECRET` is used to sign authentication tokens — use a long random
string in production.

### Password reset emails (optional)

"Forgot password?" emails a one-time reset link through
[Resend](https://resend.com). Add to `.env`:

```
RESEND_API_KEY=re_your_key
EMAIL_FROM=Stock Screener <onboarding@resend.dev>
APP_URL=http://localhost:5173
```

`APP_URL` is where the app is opened, used to build the link. Without your
own verified domain, Resend's shared `onboarding@resend.dev` sender can only
deliver to the email your Resend account is registered with — fine for
personal use. Without these settings, reset emails are printed to the server
console instead of sent, so the flow still works locally.

## Running

```bash
pnpm run dev
```

This starts the Express API server (port 3001) and the Vite dev server
(port 5173) together. Open `http://localhost:5173` in a browser — you'll
be prompted to register or log in before accessing the screens.

## Auth

The app uses email/password authentication with JWT tokens. Register an
account on first use. Sessions last 7 days. Passwords can be changed from the
Account page, or reset from the login screen via an emailed link; either
signs out every other session. User data is stored in a
local SQLite database (`data/screener.db`, gitignored).

## Database

Users, their watchlists and the tracked ticker list live in
`data/screener.db` (gitignored).

- **Seeding:** a fresh database is seeded from `src/seed/tickers.json` —
  every ticker with its name, sector, sub-sector and currency. Seeding only
  happens when the table is first created; an existing database is never
  touched.
- **Updating the seed:** after changing the ticker list in the app, run
  `pnpm run db:export-seed` and commit `src/seed/tickers.json` so new setups
  start from the same list. User accounts and watchlists are never exported.
- **Backups:** `pnpm run db:backup` writes a consistent snapshot (tickers,
  users and watchlists) to `data/backups/`, safe while the server is running. To
  restore, stop the server and copy a backup over `data/screener.db`.

## Tests

```bash
pnpm test               # server: indicators, screens, data, auth, watchlists
pnpm --dir client test  # client: views, components, composables
```
