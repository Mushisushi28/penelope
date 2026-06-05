import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Vite 5 strips 'node:' prefix before resolving; alias back to the correct id.
    alias: {
      sqlite: 'node:sqlite',
    },
  },
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    server: {
      deps: {
        external: [/^node:/],
      },
    },
  },
});
