import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/e2e/**/*.e2e.ts'],
    environment: 'node',
    fileParallelism: false,
  },
});
