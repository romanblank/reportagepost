import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Ленивая инициализация (урок CI 2026-07-13): next build импортирует роуты при
// «collect page data» — падать можно только при первом ЗАПРОСЕ, не при импорте
// (в docker-образе DATABASE_URL нет, он приходит в рантайме из Lockbox).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задан (.env)');
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      // Пул не был настроен вовсе, то есть работал дефолт node-postgres — 10
      // соединений на процесс. Страница каталога делает до тринадцати запросов,
      // часть параллельно, а ночной пересчёт рейтингов — до 25 транзакций
      // разом: под нагрузкой запросы начинали ждать в очереди, и снаружи это
      // выглядит как «сайт подвис», а не как понятная ошибка.
      max: Number(process.env.DB_POOL_MAX ?? 20),
      // Зависший запрос иначе держит соединение до бесконечности и незаметно
      // выедает пул. Пятнадцать секунд заведомо больше любого нашего запроса.
      statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 15_000),
      idleTimeoutMillis: 30_000,
    }),
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
