import { defineConfig } from 'vitest/config';

// Separate config for integration tests that hit a real database - kept out
// of the default `npm test` / CI run (see vitest.config.mts + ci.yml),
// since those need no DATABASE_URL/secrets by design. Run these explicitly
// with `npm run test:integration` against a real, reachable DATABASE_URL.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30_000,
    setupFiles: ['dotenv/config'],
  },
});
