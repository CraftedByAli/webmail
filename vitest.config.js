import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(process.cwd()) } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    coverage: { provider: 'v8', include: ['lib/**/*.js', 'utils/**/*.js'] },
  },
});
