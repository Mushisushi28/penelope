import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
  },
  ssr: {
    // Prevent vite from trying to transform native addons
    external: ["better-sqlite3"],
  },
});
