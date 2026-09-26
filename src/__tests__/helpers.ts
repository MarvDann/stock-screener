import jwt from "jsonwebtoken";
import db from "../db";
import { JWT_SECRET } from "../jwtSecret";
import { DailyBar } from "../types";

export function makeBar(overrides: Partial<DailyBar> = {}): DailyBar {
  return {
    date: new Date("2024-01-02"),
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1_000_000,
    ...overrides,
  };
}

export function makeBars(count: number, base: Partial<DailyBar> = {}): DailyBar[] {
  return Array.from({ length: count }, (_, i) =>
    makeBar({
      date: new Date(2024, 0, 2 + i),
      close: 100 + i * 0.1,
      open: 100 + i * 0.1 - 0.5,
      high: 100 + i * 0.1 + 3,
      low: 100 + i * 0.1 - 3,
      ...base,
    })
  );
}

/** Inserts a user and returns a valid login token for them (requireAuth checks the user exists). */
export function createTestUser(email = `user-${Math.random().toString(36).slice(2)}@example.com`) {
  const id = Number(db.prepare("INSERT INTO users (email, password_hash) VALUES (?, 'x')").run(email).lastInsertRowid);
  return { id, email, token: jwt.sign({ id, email, tv: 0 }, JWT_SECRET) };
}
