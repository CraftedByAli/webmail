import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(process.cwd()) } },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
