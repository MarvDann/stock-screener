/**
 * Writes a snapshot of the Postgres database (tickers, ETFs, users and
 * watchlists) to data/backups/stockwatch-<timestamp>.dump with pg_dump, which
 * is safe while the server is running.
 *
 * Restore into an empty database with:
 *   pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" <file>
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const DEFAULT_DATABASE_URL = "postgres://stockwatch:stockwatch@localhost:5432/stockwatch";
const dir = process.env.BACKUP_DIR ?? path.join(__dirname, "..", "..", "data", "backups");

fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = path.join(dir, `stockwatch-${stamp}.dump`);
try {
  execFileSync("pg_dump", ["--format=custom", `--file=${dest}`, process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL], {
    stdio: "inherit",
  });
  console.log(`Backed up to ${path.relative(process.cwd(), dest)}`);
} catch (err) {
  console.error("Backup failed (is pg_dump installed and on PATH?):", (err as Error).message);
  process.exit(1);
}
