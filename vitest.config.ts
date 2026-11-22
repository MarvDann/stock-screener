import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
    // Each test file gets its own throwaway database (see setupDb.ts).
    setupFiles: ["src/__tests__/setupDb.ts"],
    env: { BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret" },
  },
});
