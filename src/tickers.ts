import { Router, Request, Response } from "express";
import db from "./db";
import { requireAuth } from "./middleware/requireAuth";
import { SAMPLE_UNIVERSE } from "./universe";
import { STOCK_NAMES } from "./stockNames";
import type { TickerProfile } from "./types";

export interface Ticker {
  symbol: string;
  name: string;
  /** Null until looked up; "" when the data provider has no sector for it. */
  sector: string | null;
  /** Sub-sector. Null until looked up; "" when the data provider has none. */
  industry: string | null;
  /** Trading currency as the data provider quotes it, e.g. "USD" or "GBp" (pence). Null until looked up. */
  currency: string | null;
}

/**
 * Letters, digits and the punctuation data providers use in symbols:
 * "-" for share classes (BRK-B), "." for exchange suffixes (SHOP.TO),
 * "^" for indices (^GSPC) and "=" for futures/FX (GC=F).
 */
export const SYMBOL_PATTERN = /^[A-Z0-9^][A-Z0-9.=-]{0,14}$/;
const MAX_NAME_LENGTH = 100;

const tableExists = db
  .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tickers'")
  .get();

db.exec(`
  CREATE TABLE IF NOT EXISTS tickers (
    symbol TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    sector TEXT,
    industry TEXT,
    currency TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Tables created before these columns existed get them added in place.
const columns = (db.prepare("PRAGMA table_info(tickers)").all() as { name: string }[]).map((c) => c.name);
if (!columns.includes("sector")) db.exec("ALTER TABLE tickers ADD COLUMN sector TEXT");
if (!columns.includes("industry")) db.exec("ALTER TABLE tickers ADD COLUMN industry TEXT");
if (!columns.includes("currency")) db.exec("ALTER TABLE tickers ADD COLUMN currency TEXT");

const TICKER_COLUMNS = "symbol, name, sector, industry, currency";

// Seed only when the table is first created, so deleting every ticker
// doesn't bring the S&P 500 list back on the next restart.
if (!tableExists) {
  const insert = db.prepare("INSERT OR IGNORE INTO tickers (symbol, name) VALUES (?, ?)");
  db.transaction(() => {
    for (const symbol of SAMPLE_UNIVERSE) insert.run(symbol, STOCK_NAMES[symbol] ?? "");
  })();
}

export function listTickers(): Ticker[] {
  return db.prepare(`SELECT ${TICKER_COLUMNS} FROM tickers ORDER BY symbol`).all() as Ticker[];
}

export function listSymbols(): string[] {
  return listTickers().map((t) => t.symbol);
}

export function getNameMap(): Record<string, string> {
  return Object.fromEntries(listTickers().map((t) => [t.symbol, t.name]));
}

export function getCurrencyMap(): Record<string, string | null> {
  return Object.fromEntries(listTickers().map((t) => [t.symbol, t.currency]));
}

export function getTickerCurrency(symbol: string): string | null {
  const row = db.prepare("SELECT currency FROM tickers WHERE symbol = ?").get(symbol) as { currency: string | null } | undefined;
  return row?.currency ?? null;
}

export function getTickerName(symbol: string): string {
  const row = db.prepare("SELECT name FROM tickers WHERE symbol = ?").get(symbol) as { name: string } | undefined;
  return row?.name ?? "";
}

/**
 * Looks up the profile (sector, industry, currency) for every ticker missing
 * part of it, a batch at a time. Failures stay null and are retried next run.
 */
export async function backfillProfiles(
  lookup: (symbol: string) => Promise<TickerProfile>,
  { batchSize = 5, delayMs = 250 }: { batchSize?: number; delayMs?: number } = {}
): Promise<{ updated: number; failed: number }> {
  const pending = (
    db.prepare("SELECT symbol FROM tickers WHERE sector IS NULL OR currency IS NULL ORDER BY symbol").all() as {
      symbol: string;
    }[]
  ).map((r) => r.symbol);
  const update = db.prepare("UPDATE tickers SET sector = ?, industry = ?, currency = ? WHERE symbol = ?");
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((symbol) => lookup(symbol)));
    results.forEach((result, j) => {
      if (result.status === "fulfilled") {
        // A ticker deleted mid-run simply matches no row.
        update.run(result.value.sector, result.value.industry, result.value.currency, batch[j]);
        updated++;
      } else {
        failed++;
      }
    });
    if (delayMs > 0 && i + batchSize < pending.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { updated, failed };
}

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const symbol = raw.trim().toUpperCase();
  return SYMBOL_PATTERN.test(symbol) ? symbol : null;
}

function normalizeName(raw: unknown): string | null {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name.length <= MAX_NAME_LENGTH ? name : null;
}

export interface TickersRouterDeps {
  /**
   * Confirms the symbol has price data; returns its display name (and profile,
   * or null if that lookup failed), or null if the symbol is unknown.
   */
  lookupTicker: (symbol: string) => Promise<{ name: string; profile?: TickerProfile | null } | null>;
  /** Called after a ticker is added or removed so cached scans can be dropped. */
  onChange?: () => void;
}

export function createTickersRouter({ lookupTicker, onChange }: TickersRouterDeps): Router {
  const router = Router();

  router.get("/api/tickers", requireAuth, (_req: Request, res: Response) => {
    res.json({ tickers: listTickers() });
  });

  router.post("/api/tickers", requireAuth, async (req: Request, res: Response) => {
    const symbol = normalizeSymbol(req.body?.symbol);
    if (!symbol) {
      res.status(400).json({ error: "Invalid symbol — use letters, digits, '.', '-', '^' or '=' (max 15 chars)" });
      return;
    }
    const name = normalizeName(req.body?.name);
    if (name === null) {
      res.status(400).json({ error: `Name must be text of at most ${MAX_NAME_LENGTH} characters` });
      return;
    }
    if (db.prepare("SELECT 1 FROM tickers WHERE symbol = ?").get(symbol)) {
      res.status(409).json({ error: `${symbol} is already in the list` });
      return;
    }

    let found: Awaited<ReturnType<TickersRouterDeps["lookupTicker"]>>;
    try {
      found = await lookupTicker(symbol);
    } catch (err) {
      console.error(`Ticker lookup failed for ${symbol}:`, err);
      res.status(502).json({ error: `Couldn't verify ${symbol} with the data provider — try again` });
      return;
    }
    if (!found) {
      res.status(422).json({ error: `No price data found for ${symbol}` });
      return;
    }

    const ticker: Ticker = {
      symbol,
      name: name || found.name,
      sector: found.profile?.sector ?? null,
      industry: found.profile?.industry ?? null,
      currency: found.profile?.currency ?? null,
    };
    db.prepare("INSERT INTO tickers (symbol, name, sector, industry, currency) VALUES (?, ?, ?, ?, ?)").run(
      ticker.symbol,
      ticker.name,
      ticker.sector,
      ticker.industry,
      ticker.currency
    );
    onChange?.();
    res.status(201).json(ticker);
  });

  router.patch("/api/tickers/:symbol", requireAuth, (req: Request, res: Response) => {
    const symbol = String(req.params.symbol).toUpperCase();
    const name = normalizeName(req.body?.name);
    if (name === null) {
      res.status(400).json({ error: `Name must be text of at most ${MAX_NAME_LENGTH} characters` });
      return;
    }
    const result = db.prepare("UPDATE tickers SET name = ? WHERE symbol = ?").run(name, symbol);
    if (result.changes === 0) {
      res.status(404).json({ error: `${symbol} is not in the list` });
      return;
    }
    res.json(db.prepare(`SELECT ${TICKER_COLUMNS} FROM tickers WHERE symbol = ?`).get(symbol));
  });

  router.delete("/api/tickers/:symbol", requireAuth, (req: Request, res: Response) => {
    const symbol = String(req.params.symbol).toUpperCase();
    const result = db.prepare("DELETE FROM tickers WHERE symbol = ?").run(symbol);
    if (result.changes === 0) {
      res.status(404).json({ error: `${symbol} is not in the list` });
      return;
    }
    onChange?.();
    res.status(204).end();
  });

  return router;
}
