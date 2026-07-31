import { describe, expect, it } from 'vitest';
import 'dotenv/config';

// Rate-limit — единственный антибрутфорс и антиспам платформы (аудит
// 2026-07-31, P1: не был покрыт ничем). На нём держатся: вход и сброс пароля,
// регистрация, раскрытие телефонов, загрузка фото, лайки, жалобы, письма
// подтверждения. Молчаливая поломка = открытые двери, и заметить её нечем.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('rate-limit: окно, счёт и изоляция ключей (БД)', () => {
  it('пропускает до лимита, бросает 429 сверх него, разные ключи не мешают друг другу', async () => {
    const { db } = await import('@/lib/db');
    const { rateLimit } = await import('@/lib/rate-limit');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const key = `test-rl:${stamp}`;
    const other = `test-rl-other:${stamp}`;

    // Ровно 3 попытки в окне проходят
    await rateLimit(key, 3, 3600);
    await rateLimit(key, 3, 3600);
    await rateLimit(key, 3, 3600);

    // Четвёртая — отказ с корректным статусом
    await expect(rateLimit(key, 3, 3600)).rejects.toThrowError(DomainError);
    await rateLimit(key, 3, 3600).catch((e: unknown) => {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as InstanceType<typeof DomainError>).status).toBe(429);
      expect((e as InstanceType<typeof DomainError>).code).toBe('rate_limited');
    });

    // Соседний ключ (другой пользователь/IP) не затронут — иначе один
    // злоумышленник блокировал бы вход всем сразу
    await expect(rateLimit(other, 3, 3600)).resolves.toBeUndefined();

    // Счётчик действительно материализован (джоб обслуживания его же и чистит)
    const row = await db.rateLimit.findFirst({ where: { key }, select: { count: true } });
    expect(row!.count).toBeGreaterThanOrEqual(4);

    await db.rateLimit.deleteMany({ where: { key: { in: [key, other] } } });
  });

  it('окна независимы: счёт прошлого окна не блокирует следующее', async () => {
    const { db } = await import('@/lib/db');
    const { rateLimit } = await import('@/lib/rate-limit');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const key = `test-rl-window:${stamp}`;
    const windowSec = 60;

    // Исчерпываем лимит в ПРОШЛОМ окне вручную (эмулируем вчерашние попытки)
    const prevStart = new Date(Math.floor((Date.now() - windowSec * 1000) / (windowSec * 1000)) * windowSec * 1000);
    await db.rateLimit.create({ data: { key, windowStart: prevStart, count: 999 } });

    // Текущее окно чистое — запрос проходит (иначе один всплеск блокировал бы
    // пользователя навсегда)
    await expect(rateLimit(key, 3, windowSec)).resolves.toBeUndefined();

    await db.rateLimit.deleteMany({ where: { key } });
  });
});
