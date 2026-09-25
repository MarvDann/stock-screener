/**
 * Writes a consistent snapshot of the SQLite database (tickers and users) to
 * data/backups/screener-<timestamp>.db. Uses SQLite's online backup, so it's
 * safe while the server is running (a plain file copy can miss WAL writes).
 *
 * Restore by stopping the server and copying a backup over data/screener.db.
 */
import fs from "fs";
import path from "path";
import db, { DATA_DIR } from "../db";

async function main() {
  const dir = path.join(DATA_DIR, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = path.join(dir, `screener-${stamp}.db`);
  await db.backup(dest);
  console.log(`Backed up to ${path.relative(process.cwd(), dest)}`);
}

main().catch((err) => {
  console.error("Backup failed:", err);
  process.exit(1);
});
