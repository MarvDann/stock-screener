import { Router, Request, Response } from "express";
import { execute, query, Queryable } from "./db";
import { requireAdmin, requireAuth } from "./middleware/requireAuth";
import type { TickerProfile } from "./types";
import SEED_TICKERS from "./seed/tickers.json";

export interface Ticker {
  symbol: string;
  name: string;
  /** Null until looked up; "" when the data provider has no sector for it. */
  sector: string | null;
  /** Sub-sector. Null until looked up; "" when the data provider has none. */
  industry: string | null;
  /** Trading currency as the data provider quotes it, e.g. "USD" or "GBp" (pence). Null until looked up. */
  currency: string | null;
  /**
   * An industry group of the user's own, e.g. "Cybersecurity", ranked in
   * place of `industry` on the Industry Groups page. Null when unset.
   */
  customGroup: string | null;
}

/**
 * Letters, digits and the punctuation data providers use in symbols:
 * "-" for share classes (BRK-B), "." for exchange suffixes (SHOP.TO),
 * "^" for indices (^GSPC) and "=" for futures/FX (GC=F).
 */
export const SYMBOL_PATTERN = /^[A-Z0-9^][A-Z0-9.=-]{0,14}$/;
const MAX_NAME_LENGTH = 100;
const MAX_GROUP_LENGTH = 50;

const TICKER_COLUMNS = "symbol, name, sector, industry, currency, custom_group AS \"customGroup\"";

/**
 * Every tracked ticker by symbol. Read on nearly every request, so it's kept
 * in memory: loaded at startup by loadTickers() and updated alongside each
 * write below (this server is the only writer).
 */
let tickers = new Map<string, Ticker>();

/** Seeds a fresh tickers table from the seed file, a snapshot of a real list (`pnpm run db:export-seed`). */
export async function seedTickers(client: Queryable): Promise<void> {
  for (const t of SEED_TICKERS as Partial<Ticker>[]) {
    await client.query(
      "INSERT INTO tickers (symbol, name, sector, industry, currency, custom_group) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
      [t.symbol, t.name, t.sector, t.industry, t.currency, t.customGroup ?? null]
    );
  }
}

/** (Re)loads the ticker list from the database; call once at startup, after migrating. */
export async function loadTickers(): Promise<void> {
  const rows = await query<Ticker>(`SELECT ${TICKER_COLUMNS} FROM tickers ORDER BY symbol`);
  tickers = new Map(rows.map((t) => [t.symbol, t]));
}

export function listTickers(): Ticker[] {
  return [...tickers.values()].sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
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
  return tickers.get(symbol)?.currency ?? null;
}

export function getTickerName(symbol: string): string {
  return tickers.get(symbol)?.name ?? "";
}

/**
 * Looks up the profile (sector, industry, currency) for every ticker missing
 * part of it, a batch at a time. Failures stay null and are retried next run.
 */
export async function backfillProfiles(
  lookup: (symbol: string) => Promise<TickerProfile>,
  { batchSize = 5, delayMs = 250 }: { batchSize?: number; delayMs?: number } = {}
): Promise<{ updated: number; failed: number }> {
  const pending = listTickers()
    .filter((t) => t.sector === null || t.currency === null)
    .map((t) => t.symbol);
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((symbol) => lookup(symbol)));
    for (const [j, result] of results.entries()) {
      if (result.status === "fulfilled") {
        const { sector, industry, currency } = result.value;
        await execute("UPDATE tickers SET sector = $1, industry = $2, currency = $3 WHERE symbol = $4", [
          sector,
          industry,
          currency,
          batch[j],
        ]);
        // A ticker deleted mid-run simply isn't there to update.
        const ticker = tickers.get(batch[j]);
        if (ticker) tickers.set(batch[j], { ...ticker, sector, industry, currency });
        updated++;
      } else {
        failed++;
      }
    }
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

/** A custom group name, "" to clear it, or null when invalid. */
function normalizeGroup(raw: unknown): string | null {
  if (raw === null) return "";
  if (typeof raw !== "string") return null;
  const group = raw.trim().replace(/\s+/g, " ");
  return group.length <= MAX_GROUP_LENGTH ? group : null;
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
    if (tickers.has(symbol)) {
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
      customGroup: null,
    };
    const inserted = await execute(
      "INSERT INTO tickers (symbol, name, sector, industry, currency) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
      [ticker.symbol, ticker.name, ticker.sector, ticker.industry, ticker.currency]
    );
    // Lost a race with another request adding the same symbol during the lookup.
    if (inserted === 0) {
      res.status(409).json({ error: `${symbol} is already in the list` });
      return;
    }
    tickers.set(symbol, ticker);
    onChange?.();
    res.status(201).json(ticker);
  });

  // Updates the name, the custom group, or both; fields left out are unchanged.
  // Admins only: names and groups show on everyone's screens.
  router.patch("/api/tickers/:symbol", requireAdmin, async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol).toUpperCase();
    const body = req.body ?? {};
    const updates: [column: string, value: string | null][] = [];
    if ("name" in body) {
      const name = normalizeName(body.name);
      if (name === null) {
        res.status(400).json({ error: `Name must be text of at most ${MAX_NAME_LENGTH} characters` });
        return;
      }
      updates.push(["name", name]);
    }
    if ("customGroup" in body) {
      const group = normalizeGroup(body.customGroup);
      if (group === null) {
        res.status(400).json({ error: `Group must be text of at most ${MAX_GROUP_LENGTH} characters` });
        return;
      }
      updates.push(["custom_group", group || null]);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: "Nothing to update — send a name or customGroup" });
      return;
    }
    const [updated] = await query<Ticker>(
      `UPDATE tickers SET ${updates.map(([column], i) => `${column} = $${i + 1}`).join(", ")}
       WHERE symbol = $${updates.length + 1} RETURNING ${TICKER_COLUMNS}`,
      [...updates.map(([, value]) => value), symbol]
    );
    if (!updated) {
      res.status(404).json({ error: `${symbol} is not in the list` });
      return;
    }
    tickers.set(symbol, updated);
    res.json(updated);
  });

  router.delete("/api/tickers/:symbol", requireAdmin, async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol).toUpperCase();
    const deleted = await execute("DELETE FROM tickers WHERE symbol = $1", [symbol]);
    tickers.delete(symbol);
    if (deleted === 0) {
      res.status(404).json({ error: `${symbol} is not in the list` });
      return;
    }
    onChange?.();
    res.status(204).end();
  });

  return router;
}
