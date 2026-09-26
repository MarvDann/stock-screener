import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export const DATA_DIR = path.join(__dirname, "..", "data");
// DB_PATH lets tests point at ":memory:" instead of the real database file.
const DB_PATH = process.env.DB_PATH ?? path.join(DATA_DIR, "screener.db");

if (!process.env.DB_PATH) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Bumping a user's token_version signs out every session issued before it
// (e.g. after a password change); requireAuth checks it on each request.
const userColumns = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
if (!userColumns.includes("token_version")) {
  db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0");
}

// Password reset links. Only a SHA-256 hash of each token is stored, so a
// copy of the database can't be used to reset anyone's password.
db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

export default db;
