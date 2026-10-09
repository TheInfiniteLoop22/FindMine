import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests hit a real database and run separately via
    // `npm run test:integration` (vitest.integration.config.mts) - kept
    // out of the default/CI run, which needs no DATABASE_URL/secrets.
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
  },
});
