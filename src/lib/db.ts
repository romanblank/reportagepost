import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Ленивая инициализация (урок CI 2026-07-13): next build импортирует роуты при
// «collect page data» — падать можно только при первом ЗАПРОСЕ, не при импорте
// (в docker-образе DATABASE_URL нет, он приходит в рантайме из Lockbox).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задан (.env)');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
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
