import { PoolClient } from "pg";
import { getMigrations } from "better-auth/db/migration";
import { authOptions } from "./auth";
import { pool, query } from "./db";
import { seedTickers } from "./tickers";
import { seedEtfs } from "./etfs";

/**
 * The app's schema changes, applied in order and each exactly once (tracked
 * in schema_migrations). Never edit one that has shipped; add a new one.
 */
const MIGRATIONS: { name: string; up: (client: PoolClient) => Promise<void> }[] = [
  {
    name: "001_tickers_etfs_watchlists",
    async up(client) {
      await client.query(`
        CREATE TABLE tickers (
          symbol TEXT PRIMARY KEY,
          name TEXT NOT NULL DEFAULT '',
          sector TEXT,
          industry TEXT,
          currency TEXT,
          custom_group TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        -- id keeps the order ETFs were added in.
        CREATE TABLE etfs (
          id INTEGER GENERATED ALWAYS AS IDENTITY,
          symbol TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          currency TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        -- Watchlists belong to one user each. Names are unique per user, ignoring case.
        CREATE TABLE watchlists (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX watchlists_user_name ON watchlists (user_id, lower(name));

        -- Symbols aren't tied to the tickers table: removing a ticker from the
        -- screener leaves it on watchlists, where it can still be removed by hand.
        -- position orders a list; it can have gaps, only the order matters.
        CREATE TABLE watchlist_items (
          watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
          symbol TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (watchlist_id, symbol)
        );
      `);
      // Seeded only here, when the tables are created, so emptying a list
      // doesn't bring it back on the next restart.
      await seedTickers(client);
      await seedEtfs(client);
    },
  },
];

/** Brings the database up to date: Better Auth's tables first (watchlists reference users), then the app's. */
export async function migrate(): Promise<void> {
  const { runMigrations } = await getMigrations(authOptions);
  await runMigrations();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Two processes starting at once (e.g. a deploy overlapping a restart) take turns.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('stockwatch-migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const applied = new Set((await query<{ name: string }>("SELECT name FROM schema_migrations", [], client)).map((r) => r.name));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.name)) continue;
      await migration.up(client);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
      console.log(`Applied migration ${migration.name}`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// `pnpm run db:migrate` (the deploy runs it before restarting the server).
if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
