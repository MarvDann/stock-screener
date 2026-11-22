import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { authOptions } from "../auth";
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

// Same secret and database as the app's auth, so its session cookies pass requireAuth.
const testAuth = betterAuth({ ...authOptions, plugins: [testUtils()] });

/** Saves a verified user and signs them in; send `cookie` as the Cookie header to make requests as them. */
export async function createTestUser(email = `user-${Math.random().toString(36).slice(2)}@example.com`) {
  const { test } = await testAuth.$context;
  const user = await test.saveUser(test.createUser({ email, emailVerified: true }));
  const { headers } = await test.login({ userId: user.id });
  return { id: user.id, email, cookie: headers.get("cookie")! };
}
