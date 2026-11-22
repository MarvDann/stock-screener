/**
 * Runs before each test file: gives the file its own empty Postgres database
 * (created through TEST_DATABASE_URL's server), migrated and seeded like a
 * fresh install, and drops it afterwards. Test files can run in parallel
 * without seeing each other's rows, or each other's tables while migrating.
 */
import { afterAll } from "vitest";
import { Client } from "pg";

const adminUrl = process.env.TEST_DATABASE_URL ?? "postgres://stockwatch:stockwatch@localhost:5432/stockwatch_test";
const name = `test_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;

async function admin(sql: string) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

await admin(`CREATE DATABASE ${name}`);
const url = new URL(adminUrl);
url.pathname = `/${name}`;
// Set before anything imports ../db, which reads it when creating the pool.
process.env.DATABASE_URL = url.toString();

const { migrate } = await import("../migrate");
const { loadTickers } = await import("../tickers");
const { loadEtfs } = await import("../etfs");
const { pool } = await import("../db");
await migrate();
await Promise.all([loadTickers(), loadEtfs()]);

afterAll(async () => {
  await pool.end();
  await admin(`DROP DATABASE ${name} WITH (FORCE)`);
});
