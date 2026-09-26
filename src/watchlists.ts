import { Router, Request, Response } from "express";
import db from "./db";
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

// Watchlists belong to one user each. Names are unique per user, ignoring case.
db.exec(`
  CREATE TABLE IF NOT EXISTS watchlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, name COLLATE NOCASE)
  )
`);

// Symbols aren't tied to the tickers table: removing a ticker from the
// screener leaves it on watchlists, where it can still be removed by hand.
// `position` orders a list; it can have gaps, only the order matters.
db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist_items (
    watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (watchlist_id, symbol)
  )
`);

// Tables created before `position` existed get it added, keeping the order they were added in.
const itemColumns = (db.prepare("PRAGMA table_info(watchlist_items)").all() as { name: string }[]).map((c) => c.name);
if (!itemColumns.includes("position")) {
  db.exec("ALTER TABLE watchlist_items ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE watchlist_items SET position = rowid");
}

function itemsOf(watchlistId: number): { symbol: string; position: number }[] {
  return db
    .prepare("SELECT symbol, position FROM watchlist_items WHERE watchlist_id = ? ORDER BY position, rowid")
    .all(watchlistId) as { symbol: string; position: number }[];
}

function symbolsOf(watchlistId: number): string[] {
  return itemsOf(watchlistId).map((r) => r.symbol);
}

/**
 * Adds `symbol` at `index` in the list (e.g. to undo a removal), or on the
 * end when `index` is undefined or past the end.
 */
function insertSymbol(watchlistId: number, symbol: string, index: number | undefined) {
  db.transaction(() => {
    const items = itemsOf(watchlistId);
    let position: number;
    if (index !== undefined && index < items.length) {
      position = items[index].position;
      db.prepare("UPDATE watchlist_items SET position = position + 1 WHERE watchlist_id = ? AND position >= ?").run(
        watchlistId,
        position
      );
    } else {
      position = (items.at(-1)?.position ?? -1) + 1;
    }
    db.prepare("INSERT INTO watchlist_items (watchlist_id, symbol, position) VALUES (?, ?, ?)").run(
      watchlistId,
      symbol,
      position
    );
  })();
}

export function listWatchlists(userId: number): Watchlist[] {
  const rows = db
    .prepare("SELECT id, name FROM watchlists WHERE user_id = ? ORDER BY name COLLATE NOCASE")
    .all(userId) as { id: number; name: string }[];
  return rows.map((r) => ({ ...r, symbols: symbolsOf(r.id) }));
}

/** The user's watchlist with this id, or undefined if it's missing or someone else's. */
function findWatchlist(userId: number, rawId: unknown): Watchlist | undefined {
  const id = Number(rawId);
  if (!Number.isInteger(id)) return undefined;
  const row = db.prepare("SELECT id, name FROM watchlists WHERE id = ? AND user_id = ?").get(id, userId) as
    | { id: number; name: string }
    | undefined;
  return row && { ...row, symbols: symbolsOf(row.id) };
}

function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}

function nameTaken(userId: number, name: string, exceptId?: number): boolean {
  return !!db
    .prepare("SELECT 1 FROM watchlists WHERE user_id = ? AND name = ? COLLATE NOCASE AND id IS NOT ?")
    .get(userId, name, exceptId ?? null);
}

const INVALID_NAME = `Name must be 1–${MAX_NAME_LENGTH} characters`;
const NOT_FOUND = "Watchlist not found";

export interface WatchlistsRouterDeps {
  /** Whether the app can chart this symbol (a tracked ticker or a curated ETF). */
  isKnownSymbol: (symbol: string) => boolean;
}

export function createWatchlistsRouter({ isKnownSymbol }: WatchlistsRouterDeps): Router {
  const router = Router();

  router.get("/api/watchlists", requireAuth, (req: Request, res: Response) => {
    res.json({ watchlists: listWatchlists(req.user!.id) });
  });

  router.post("/api/watchlists", requireAuth, (req: Request, res: Response) => {
    const userId = req.user!.id;
    const name = normalizeName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: INVALID_NAME });
      return;
    }
    if (nameTaken(userId, name)) {
      res.status(409).json({ error: `You already have a watchlist called "${name}"` });
      return;
    }
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM watchlists WHERE user_id = ?").get(userId) as {
      count: number;
    };
    if (count >= MAX_WATCHLISTS_PER_USER) {
      res.status(400).json({ error: `You can have at most ${MAX_WATCHLISTS_PER_USER} watchlists` });
      return;
    }
    const id = Number(db.prepare("INSERT INTO watchlists (user_id, name) VALUES (?, ?)").run(userId, name).lastInsertRowid);
    res.status(201).json({ id, name, symbols: [] } satisfies Watchlist);
  });

  router.patch("/api/watchlists/:id", requireAuth, (req: Request, res: Response) => {
    const userId = req.user!.id;
    const watchlist = findWatchlist(userId, req.params.id);
    if (!watchlist) {
      res.status(404).json({ error: NOT_FOUND });
      return;
    }
    const name = normalizeName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: INVALID_NAME });
      return;
    }
    if (nameTaken(userId, name, watchlist.id)) {
      res.status(409).json({ error: `You already have a watchlist called "${name}"` });
      return;
    }
    db.prepare("UPDATE watchlists SET name = ? WHERE id = ?").run(name, watchlist.id);
    res.json({ ...watchlist, name });
  });

  router.delete("/api/watchlists/:id", requireAuth, (req: Request, res: Response) => {
    const watchlist = findWatchlist(req.user!.id, req.params.id);
    if (!watchlist) {
      res.status(404).json({ error: NOT_FOUND });
      return;
    }
    // Foreign keys aren't enforced (no PRAGMA foreign_keys), so remove the items explicitly.
    db.transaction(() => {
      db.prepare("DELETE FROM watchlist_items WHERE watchlist_id = ?").run(watchlist.id);
      db.prepare("DELETE FROM watchlists WHERE id = ?").run(watchlist.id);
    })();
    res.status(204).end();
  });

  router.post("/api/watchlists/:id/symbols", requireAuth, (req: Request, res: Response) => {
    const watchlist = findWatchlist(req.user!.id, req.params.id);
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
    insertSymbol(watchlist.id, symbol, index);
    res.status(201).json({ ...watchlist, symbols: symbolsOf(watchlist.id) });
  });

  router.delete("/api/watchlists/:id/symbols/:symbol", requireAuth, (req: Request, res: Response) => {
    const watchlist = findWatchlist(req.user!.id, req.params.id);
    if (!watchlist) {
      res.status(404).json({ error: NOT_FOUND });
      return;
    }
    const symbol = String(req.params.symbol).toUpperCase();
    const result = db
      .prepare("DELETE FROM watchlist_items WHERE watchlist_id = ? AND symbol = ?")
      .run(watchlist.id, symbol);
    if (result.changes === 0) {
      res.status(404).json({ error: `${symbol} isn't on ${watchlist.name}` });
      return;
    }
    res.json({ ...watchlist, symbols: watchlist.symbols.filter((s) => s !== symbol) });
  });

  return router;
}
