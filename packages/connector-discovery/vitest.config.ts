import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    globals: false,
    environment: "node",
    // Allow vi.doMock / vi.resetModules for cascade ordering tests
    pool: "forks",
    poolOptions: {
      forks: {
        isolate: true,
      },
    },
  },
});
