import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
    // Each test file gets its own throwaway database (see setupDb.ts).
    setupFiles: ["src/__tests__/setupDb.ts"],
    // Tests that remove things sign in as admin@example.com. Email is switched off (printed instead of sent)
    // even if RESEND_API_KEY is in the shell, so no test can send a real email.
    env: {
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
      ADMIN_EMAILS: "admin@example.com",
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
    },
  },
});
