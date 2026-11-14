import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['test/**/*.test.{ts,tsx}', 'server/**/__tests__/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    restoreMocks: true,
  },
});
