import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./packages/*', './examples/*'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      clean: true,
      include: [
        'packages/api-client/src/**/*.ts',
        'packages/api-server/src/**/*.ts',
        'packages/api-query/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.types.test.ts',
        '**/testSetup.ts',
        '**/testHelpers.ts',
        '**/dist/**',
        '**/node_modules/**',
      ],
    },
  },
});
