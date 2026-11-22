import { Pool, PoolClient, QueryResultRow } from "pg";

const DEFAULT_DATABASE_URL = "postgres://stockwatch:stockwatch@localhost:5432/stockwatch";

/** The app's Postgres connection pool. */
export const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL, max: 10 });

/** A pool or a transaction's client; both can run queries. */
export type Queryable = Pick<Pool | PoolClient, "query">;

/** Runs a query and returns its rows. */
export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = [], db: Queryable = pool): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

/** Runs a query and returns its first row, or undefined when there are none. */
export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Queryable = pool
): Promise<T | undefined> {
  return (await query<T>(sql, params, db))[0];
}

/** Runs a statement and returns how many rows it changed. */
export async function execute(sql: string, params: unknown[] = [], db: Queryable = pool): Promise<number> {
  return (await db.query(sql, params)).rowCount ?? 0;
}

/** Runs `fn` in a transaction: committed if it resolves, rolled back if it throws. */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Whether a query failed on a unique constraint, e.g. two requests creating the same thing at once. */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}
