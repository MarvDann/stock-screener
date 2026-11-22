/**
 * One-off import from the old SQLite database (data/screener.db, or the path
 * given) into Postgres:
 *
 * - tickers and ETFs replace what's in Postgres, so the lists match exactly;
 * - each old account's watchlists are added to the Postgres account with the
 *   same email, skipping names it already has. Sign up first: passwords
 *   aren't carried over, and old accounts with no match are reported.
 *
 *   pnpm run db:import-sqlite [path/to/screener.db]
 */
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { pool, query, transaction } from "../db";
import { migrate } from "../migrate";

const source = process.argv[2] ?? path.join(__dirname, "..", "..", "data", "screener.db");

async function main() {
  const sqlite = new DatabaseSync(source, { readOnly: true });
  const all = <T>(sql: string) => sqlite.prepare(sql).all() as T[];
  const tickers = all<Record<string, string | null>>(
    "SELECT symbol, name, sector, industry, currency, custom_group FROM tickers ORDER BY symbol"
  );
  const etfs = all<Record<string, string>>("SELECT symbol, name, category, currency FROM etfs ORDER BY rowid");
  const watchlists = all<{ id: number; email: string; name: string }>(
    "SELECT w.id, u.email, w.name FROM watchlists w JOIN users u ON u.id = w.user_id ORDER BY w.id"
  );
  const items = all<{ watchlist_id: number; symbol: string; position: number }>(
    "SELECT watchlist_id, symbol, position FROM watchlist_items ORDER BY watchlist_id, position, rowid"
  );

  await migrate();
  const users = new Map(
    (await query<{ id: string; email: string }>(`SELECT id, email FROM "user"`)).map((u) => [u.email.toLowerCase(), u.id])
  );
  const unmatched = new Set<string>();
  let imported = 0;

  await transaction(async (client) => {
    await client.query("DELETE FROM tickers");
    for (const t of tickers) {
      await client.query(
        "INSERT INTO tickers (symbol, name, sector, industry, currency, custom_group) VALUES ($1, $2, $3, $4, $5, $6)",
        [t.symbol, t.name, t.sector, t.industry, t.currency, t.custom_group]
      );
    }
    await client.query("DELETE FROM etfs");
    for (const e of etfs) {
      await client.query("INSERT INTO etfs (symbol, name, category, currency) VALUES ($1, $2, $3, $4)", [
        e.symbol,
        e.name,
        e.category,
        e.currency,
      ]);
    }
    for (const w of watchlists) {
      const userId = users.get(w.email.toLowerCase());
      if (!userId) {
        unmatched.add(w.email);
        continue;
      }
      const inserted = await client.query<{ id: number }>(
        "INSERT INTO watchlists (user_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id",
        [userId, w.name]
      );
      const id = inserted.rows[0]?.id;
      if (id === undefined) continue;
      for (const item of items.filter((i) => i.watchlist_id === w.id)) {
        await client.query("INSERT INTO watchlist_items (watchlist_id, symbol, position) VALUES ($1, $2, $3)", [
          id,
          item.symbol,
          item.position,
        ]);
      }
      imported++;
    }
  });

  console.log(`Imported ${tickers.length} tickers, ${etfs.length} ETFs and ${imported} watchlists from ${source}`);
  if (unmatched.size > 0) {
    console.log(`Skipped watchlists for accounts not found in Postgres (sign up, then re-run): ${[...unmatched].join(", ")}`);
  }
  sqlite.close();
  await pool.end();
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
