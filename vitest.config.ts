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
    // Общая уборка после прогона (аудит 2026-08-01): чистка написана инлайном
    // в каждом it(), поэтому первое же падение оставляло данные навсегда —
    // в dev-базе накопилось 149 зомби-аккаунтов из 175. Подметаем по маркеру
    // @test.local, не переписывая три десятка файлов.
    globalSetup: ['./tests/global-teardown.ts'],
  },
});
