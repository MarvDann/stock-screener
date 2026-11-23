import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
    // Each test file gets its own throwaway database (see setupDb.ts).
    setupFiles: ["src/__tests__/setupDb.ts"],
    // Tests that remove things sign in as admin@example.com.
    env: { BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret", ADMIN_EMAILS: "admin@example.com" },
  },
});
