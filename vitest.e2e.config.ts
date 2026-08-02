import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/e2e/**/*.e2e.ts'],
    environment: 'node',
    fileParallelism: false,
    // Та же уборка, что у юнитов: без неё аккаунты и профили e2e оставались в
    // базе навсегда (нашли 2 зомби-профиля APPROVED, мешавших ручной проверке
    // каталога) — падение посреди сценария пропускает инлайновую чистку.
    globalSetup: ['./tests/global-teardown.ts'],
  },
});
