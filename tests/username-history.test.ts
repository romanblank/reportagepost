import { afterAll, describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Смена адреса профиля (аудит 2026-08-01, P2).
//
// Раньше смена username молча меняла URL: все существующие ссылки — из
// мессенджеров, соцсетей, визиток, поисковой выдачи — начинали вести в 404.
// Для платформы, где профиль и есть продукт автора, это потеря аудитории.
// Плюс сама смена шла check-then-update: параллельный запрос на то же имя
// давал P2002 → 500 вместо понятного «имя занято».
describe.skipIf(!hasDb)('username: прежний адрес живёт, гонка даёт 409 (БД)', () => {
  const ids: string[] = [];
  afterAll(async () => {
    const { db } = await import('@/lib/db');
    await db.usernameHistory.deleteMany({ where: { profile: { userId: { in: ids } } } });
    await db.profileCategoryScore.deleteMany({ where: { profile: { userId: { in: ids } } } });
    await db.photographerProfile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  });

  const mk = async (tag: string, stamp: string) => {
    const { db } = await import('@/lib/db');
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: tag, lastName: 'Имя', email: `un-${tag}-${stamp}@test.local` },
    });
    ids.push(u.id);
    return db.photographerProfile.create({
      data: { userId: u.id, username: `un-${tag}-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
  };

  it('после переименования старый адрес указывает на актуальный профиль', async () => {
    const { db } = await import('@/lib/db');
    const { applyProfileEdit } = await import('@/lib/profile-edit');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const p = await mk('a', stamp);
    const oldName = p.username;
    const newName = `un-renamed-${stamp}`;

    await applyProfileEdit(p.id, oldName, { username: newName });

    const fresh = await db.photographerProfile.findUniqueOrThrow({ where: { id: p.id } });
    expect(fresh.username).toBe(newName);

    // Ровно то, что читает страница профиля перед редиректом
    const history = await db.usernameHistory.findUnique({
      where: { username: oldName },
      select: { profile: { select: { username: true, status: true } } },
    });
    expect(history?.profile.username).toBe(newName);
    expect(history?.profile.status).toBe('APPROVED');
  });

  it('занятое имя отклоняется как 409, а не падает пятисоткой', async () => {
    const { applyProfileEdit } = await import('@/lib/profile-edit');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const first = await mk('b', stamp);
    const second = await mk('c', stamp);

    await expect(applyProfileEdit(second.id, second.username, { username: first.username }))
      .rejects.toMatchObject({ code: 'username_taken', status: 409 });
  });

  it('если освободившееся имя занял другой автор — редиректа на чужой профиль не будет', async () => {
    const { db } = await import('@/lib/db');
    const { applyProfileEdit } = await import('@/lib/profile-edit');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const owner = await mk('d', stamp);
    const other = await mk('e', stamp);
    const freed = owner.username;

    // Первый освобождает имя, второй его занимает
    await applyProfileEdit(owner.id, freed, { username: `un-moved-${stamp}` });
    expect(await db.usernameHistory.findUnique({ where: { username: freed } })).not.toBeNull();

    await applyProfileEdit(other.id, other.username, { username: freed });

    // Запись истории снята: честный показ нового владельца лучше редиректа
    // на постороннего автора.
    expect(await db.usernameHistory.findUnique({ where: { username: freed } })).toBeNull();
    const now = await db.photographerProfile.findUniqueOrThrow({ where: { id: other.id } });
    expect(now.username).toBe(freed);
  });
});
