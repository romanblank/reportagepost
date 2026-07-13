import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    // Интеграционные тесты делят одну локальную БД — параллельные файлы
    // конфликтуют (флак 2026-07-13: уведомления одного теста ломали cleanup другого)
    fileParallelism: false,
  },
});
