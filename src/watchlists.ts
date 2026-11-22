import { Router, Request, Response } from "express";
import { execute, isUniqueViolation, pool, query, queryOne, Queryable, transaction } from "./db";
import { requireAuth } from "./middleware/requireAuth";
import { normalizeSymbol } from "./tickers";

export interface Watchlist {
  id: number;
  name: string;
  /** In the order they were added. */
  symbols: string[];
}

const MAX_NAME_LENGTH = 60;
const MAX_WATCHLISTS_PER_USER = 50;
const MAX_SYMBOLS_PER_WATCHLIST = 200;

async function itemsOf(watchlistId: number, db: Queryable = pool): Promise<{ symbol: string; position: number }[]> {
  return query(
    "SELECT symbol, position FROM watchlist_items WHERE watchlist_id = $1 ORDER BY position, added_at",
    [watchlistId],
    db
  );
}

async function symbolsOf(watchlistId: number): Promise<string[]> {
  return (await itemsOf(watchlistId)).map((r) => r.symbol);
}

/**
 * Adds `symbol` at `index` in the list (e.g. to undo a removal), or on the
 * end when `index` is undefined or past the end.
 */
async function insertSymbol(watchlistId: number, symbol: string, index: number | undefined): Promise<void> {
  await transaction(async (client) => {
    // Locks the list so concurrent inserts can't pick the same position.
    await client.query("SELECT 1 FROM watchlists WHERE id = $1 FOR UPDATE", [watchlistId]);
    const items = await itemsOf(watchlistId, client);
    let position: number;
    if (index !== undefined && index < items.length) {
      position = items[index].position;
      await client.query("UPDATE watchlist_items SET position = position + 1 WHERE watchlist_id = $1 AND position >= $2", [
        watchlistId,
        position,
      ]);
    } else {
      position = (items.at(-1)?.position ?? -1) + 1;
    }
    await client.query("INSERT INTO watchlist_items (watchlist_id, symbol, position) VALUES ($1, $2, $3)", [
      watchlistId,
      symbol,
      position,
    ]);
  });
}

export async function listWatchlists(userId: string): Promise<Watchlist[]> {
  const rows = await query<{ id: number; name: string }>(
    "SELECT id, name FROM watchlists WHERE user_id = $1 ORDER BY lower(name)",
    [userId]
  );
  return Promise.all(rows.map(async (r) => ({ ...r, symbols: await symbolsOf(r.id) })));
}

/** The user's watchlist with this id, or undefined if it's missing or someone else's. */
async function findWatchlist(userId: string, rawId: unknown): Promise<Watchlist | undefined> {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1 || id > 2 ** 31 - 1) return undefined;
  const row = await queryOne<{ id: number; name: string }>("SELECT id, name FROM watchlists WHERE id = $1 AND user_id = $2", [
    id,
    userId,
  ]);
  return row && { ...row, symbols: await symbolsOf(row.id) };
}

function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}

async function nameTaken(userId: string, name: string, exceptId?: number): Promise<boolean> {
  return !!(await queryOne(
    "SELECT 1 FROM watchlists WHERE user_id = $1 AND lower(name) = lower($2) AND id IS DISTINCT FROM $3",
    [userId, name, exceptId ?? null]
  ));
}

const INVALID_NAME = `Name must be 1–${MAX_NAME_LENGTH} characters`;
const NOT_FOUND = "Watchlist not found";

export interface WatchlistsRouterDeps {
  /** Whether the app can chart this symbol (a tracked ticker or a curated ETF). */
  isKnownSymbol: (symbol: string) => boolean;
}

export function createWatchlistsRouter({ isKnownSymbol }: WatchlistsRouterDeps): Router {
  const router = Router();

  router.get("/api/watchlists", requireAuth, async (req: Request, res: Response) => {
    res.json({ watchlists: await listWatchlists(req.user!.id) });
  });

  router.post("/api/watchlists", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const name = normalizeName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: INVALID_NAME });
      return;
    }
    if (await nameTaken(userId, name)) {
      res.status(409).json({ error: `You already have a watchlist called "${name}"` });
      return;
    }
    const { count } = (await queryOne<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM watchlists WHERE user_id = $1",
      [userId]
    ))!;
    if (count >= MAX_WATCHLISTS_PER_USER) {
      res.status(400).json({ error: `You can have at most ${MAX_WATCHLISTS_PER_USER} watchlists` });
      return;
    }
    let id: number;
    try {
      ({ id } = (await queryOne<{ id: number }>("INSERT INTO watchlists (user_id, name) VALUES ($1, $2) RETURNING id", [
        userId,
        name,
      ]))!);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      res.status(409).json({ error: `You already have a watchlist called "${name}"` });
      return;
    }
    res.status(201).json({ id, name, symbols: [] } satisfies Watchlist);
  });

  router.patch("/api/watchlists/:id", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const watchlist = await findWatchlist(userId, req.params.id);
    if (!watchlist) {
      res.status(404).json({ error: NOT_FOUND });
      return;
    }
    const name = normalizeName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: INVALID_NAME });
      return;
    }
    if (await nameTaken(userId, name, watchlist.id)) {
      res.status(409).json({ error: `You already have a watchlist called "${name}"` });
      return;
    }
    try {
      await execute("UPDATE watchlists SET name = $1 WHERE id = $2", [name, watchlist.id]);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      res.status(409).json({ error: `You already have a watchlist called "${name}"` });
      return;
    }
    res.json({ ...watchlist, name });
  });

  router.delete("/api/watchlists/:id", requireAuth, async (req: Request, res: Response) => {
    const watchlist = await findWatchlist(req.user!.id, req.params.id);
    if (!watchlist) {
      res.status(404).json({ error: NOT_FOUND });
      return;
    }
    // Its items go with it (ON DELETE CASCADE).
    await execute("DELETE FROM watchlists WHERE id = $1", [watchlist.id]);
    res.status(204).end();
  });

  router.post("/api/watchlists/:id/symbols", requireAuth, async (req: Request, res: Response) => {
    const watchlist = await findWatchlist(req.user!.id, req.params.id);
    if (!watchlist) {
      res.status(404).json({ error: NOT_FOUND });
      return;
    }
    const symbol = normalizeSymbol(req.body?.symbol);
    if (!symbol) {
      res.status(400).json({ error: "Invalid symbol" });
      return;
    }
    const index = req.body?.index;
    if (index !== undefined && !(Number.isInteger(index) && index >= 0)) {
      res.status(400).json({ error: "index must be a whole number, 0 or more" });
      return;
    }
    if (!isKnownSymbol(symbol)) {
      res.status(422).json({ error: `${symbol} isn't a tracked ticker or ETF — add it on the Tickers page first` });
      return;
    }
    if (watchlist.symbols.includes(symbol)) {
      res.status(409).json({ error: `${symbol} is already on ${watchlist.name}` });
      return;
    }
    if (watchlist.symbols.length >= MAX_SYMBOLS_PER_WATCHLIST) {
      res.status(400).json({ error: `A watchlist can hold at most ${MAX_SYMBOLS_PER_WATCHLIST} symbols` });
      return;
    }
    try {
      await insertSymbol(watchlist.id, symbol, index);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      res.status(409).json({ error: `${symbol} is already on ${watchlist.name}` });
      return;
    }
    res.status(201).json({ ...watchlist, symbols: await symbolsOf(watchlist.id) });
  });

  router.delete("/api/watchlists/:id/symbols/:symbol", requireAuth, async (req: Request, res: Response) => {
    const watchlist = await findWatchlist(req.user!.id, req.params.id);
    if (!watchlist) {
      res.status(404).json({ error: NOT_FOUND });
      return;
    }
    const symbol = String(req.params.symbol).toUpperCase();
    const deleted = await execute("DELETE FROM watchlist_items WHERE watchlist_id = $1 AND symbol = $2", [
      watchlist.id,
      symbol,
    ]);
    if (deleted === 0) {
      res.status(404).json({ error: `${symbol} isn't on ${watchlist.name}` });
      return;
    }
    res.json({ ...watchlist, symbols: watchlist.symbols.filter((s) => s !== symbol) });
  });

  return router;
}
