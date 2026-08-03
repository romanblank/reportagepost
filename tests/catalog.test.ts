import { afterAll, describe, expect, it } from 'vitest';
import 'dotenv/config'; // @/lib/catalog → @/lib/db требует DATABASE_URL при импорте
import { completenessScore } from '@/lib/catalog';

const hasDb = Boolean(process.env.DATABASE_URL);
const now = new Date('2026-07-13T12:00:00Z');

// Антиклассизм-инвариант: подписка НЕ двигает порядок ОСНОВНОЙ выдачи каталога.
describe.skipIf(!hasDb)('catalog: инвариант — подписка не двигает merit-порядок (БД)', () => {
  const ids: string[] = [];
  afterAll(async () => {
    const { db } = await import('@/lib/db');
    await db.subscription.deleteMany({ where: { userId: { in: ids } } });
    await db.pricePackage.deleteMany({ where: { profile: { userId: { in: ids } } } });
    await db.photo.deleteMany({ where: { profile: { userId: { in: ids } } } });
    await db.profileCategory.deleteMany({ where: { profile: { userId: { in: ids } } } });
    await db.photographerProfile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  });

  it('грант подписки одному из двух равных по merit не меняет их порядок', async () => {
    const { db } = await import('@/lib/db');
    const { catalogForCity } = await import('@/lib/catalog');
    const { grantFoundingSub } = await import('@/lib/subscription');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });
    // Merit задаём ЯВНО и по-разному: у «a» он выше. Раньше оба профиля имели
    // одинаковый score, и проверка «порядок не изменился» проходила даже когда
    // подписка реально двигала выдачу — если подписчик и так стоял первым.
    // Мутационная проверка 2026-08-03 это поймала: добавление proRank в
    // сортировку каталога не уронило ни один тест.
    // С фото — иначе каталог фильтрует пустые профили (планка качества).
    const score = (n: string) => (n === 'a' ? 9_000_000 : 8_000_000);
    const mk = async (n: string) => {
      const u = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: n, lastName: 'Инв', email: `inv-${n}-${stamp}@test.local` } });
      ids.push(u.id);
      const p = await db.photographerProfile.create({ data: { userId: u.id, username: `inv-${n}-${stamp}`, cityId: city.id, status: 'APPROVED', ratingScore: score(n) } });
      await db.photo.create({ data: { profileId: p.id, categoryId: cat.id, storageKey: `photos/inv-${n}-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() } });
      return p.username;
    };
    const ua = await mk('a');
    const ub = await mk('b');

    const orderOf = (cards: { username: string }[]) => cards.map((c) => c.username).filter((x) => x === ua || x === ub);
    const before = orderOf((await catalogForCity({ citySlug: 'moscow' })).cards);
    expect(before).toEqual([ua, ub]); // выше merit — выше в выдаче

    // Подписку получает ВТОРОЙ по merit: если бы она двигала порядок, он бы
    // поднялся. Именно это и должно быть невозможно (антиклассизм).
    await grantFoundingSub(ids[1], 'moscow', 'PRIME');
    const after = orderOf((await catalogForCity({ citySlug: 'moscow' })).cards);

    expect(after, 'подписка подняла автора в выдаче — merit-порядок продаётся').toEqual([ua, ub]);
  });

  it('профиль без одобренных фото НЕ попадает в каталог (планка качества)', async () => {
    const { db } = await import('@/lib/db');
    const { catalogForCity } = await import('@/lib/catalog');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const u = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Пустой', lastName: 'Кат', email: `inv-empty-${stamp}@test.local` } });
    ids.push(u.id);
    const p = await db.photographerProfile.create({ data: { userId: u.id, username: `inv-empty-${stamp}`, cityId: city.id, status: 'APPROVED', ratingScore: 9_500_000 } });

    const usernames = (await catalogForCity({ citySlug: 'moscow' })).cards.map((c) => c.username);
    expect(usernames).not.toContain(p.username); // пустой профиль скрыт, несмотря на высокий merit
  });

  it('фильтр бюджета — по total цене пакета (без ×24)', async () => {
    const { db } = await import('@/lib/db');
    const { catalogForCity } = await import('@/lib/catalog');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });
    // Профиль с пакетом 3ч за 15 000 ₽ (1 500 000 минор)
    const u = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Цен', lastName: 'Ник', email: `price-${stamp}@test.local` } });
    ids.push(u.id);
    const p = await db.photographerProfile.create({ data: { userId: u.id, username: `price-${stamp}`, cityId: city.id, status: 'APPROVED', ratingScore: 9_400_000 } });
    await db.photo.create({ data: { profileId: p.id, categoryId: cat.id, storageKey: `photos/price-${stamp}/o.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() } });
    await db.pricePackage.create({ data: { profileId: p.id, hours: 3, priceMinor: 1_500_000, currency: 'RUB' } });

    const inFor = async (rub: number) =>
      (await catalogForCity({ citySlug: 'moscow', maxPackagePriceMinor: rub * 100 })).cards.some((c) => c.username === p.username);
    // Бюджет 20 000 ₽ (> 15 000) — пакет проходит; 10 000 ₽ (< 15 000) — отсекается.
    // Раньше ×24 (15000 ≤ 10000·24) ложно пропускал дешёвый фильтр.
    expect(await inFor(20_000)).toBe(true);
    expect(await inFor(10_000)).toBe(false);
  });
});

describe('catalog: ранжирование v1 (полнота + свежесть)', () => {
  it('пустой профиль — низкий балл, полный — высокий', () => {
    const empty = completenessScore({
      bio: null, siteUrl: null, whatsapp: null, telegram: null,
      packagesCount: 0, photosCount: 0, lastPublishedAt: null, now,
    });
    const full = completenessScore({
      bio: 'Развёрнутое описание опыта репортажной съёмки длиннее восьмидесяти символов, честно.',
      siteUrl: 'https://x.ru', whatsapp: '+79990000000', telegram: 'user',
      packagesCount: 3, photosCount: 20, lastPublishedAt: now, now,
    });
    expect(empty).toBe(0);
    expect(full).toBe(100);
    expect(full).toBeGreaterThan(empty);
  });

  it('свежесть сгорает: публикация 90+ дней назад не даёт баллов', () => {
    const base = {
      bio: null, siteUrl: null, whatsapp: null, telegram: null,
      packagesCount: 0, photosCount: 0, now,
    };
    const fresh = completenessScore({ ...base, lastPublishedAt: now });
    const stale = completenessScore({
      ...base,
      lastPublishedAt: new Date(now.getTime() - 100 * 86_400_000),
    });
    expect(fresh).toBe(15);
    expect(stale).toBe(0);
  });
});

// Обложка каталога (аудит 2026-08-01, P2): выбранная автором обложка искалась
// внутри усечённой выборки из 6 свежих кадров — у активно публикующего автора
// она туда не попадала, и карточка молча возвращалась к последнему кадру.
describe.skipIf(!hasDb)('catalog: обложка автора уважается независимо от давности кадра (БД)', () => {
  const ids: string[] = [];
  afterAll(async () => {
    const { db } = await import('@/lib/db');
    await db.photographerProfile.updateMany({ where: { userId: { in: ids } }, data: { coverPhotoId: null } });
    await db.photo.deleteMany({ where: { profile: { userId: { in: ids } } } });
    await db.profileCategory.deleteMany({ where: { profile: { userId: { in: ids } } } });
    await db.photographerProfile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  });

  it('обложкой стоит самый старый из 7 кадров — именно он попадает в карточку', async () => {
    const { db } = await import('@/lib/db');
    const { catalogForCity } = await import('@/lib/catalog');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });
    const username = `cover-${stamp}`;

    const u = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Обл', lastName: 'Тест', email: `cover-${stamp}@test.local` } });
    ids.push(u.id);
    const p = await db.photographerProfile.create({
      data: { userId: u.id, username, cityId: city.id, status: 'APPROVED', ratingScore: 9_500_000 },
    });

    // 7 кадров: индекс 0 — самый старый, он же будущая обложка
    const photoIds: string[] = [];
    for (let i = 0; i < 7; i++) {
      const photo = await db.photo.create({
        data: {
          profileId: p.id, categoryId: cat.id, storageKey: `photos/${username}-${i}/original.jpg`,
          width: 2400, height: 1600, status: 'APPROVED',
          publishedAt: new Date(Date.now() - (7 - i) * 86_400_000),
        },
      });
      photoIds.push(photo.id);
    }
    const oldest = photoIds[0];
    await db.photographerProfile.update({ where: { id: p.id }, data: { coverPhotoId: oldest } });

    const { cards } = await catalogForCity({ citySlug: 'moscow' });
    const card = cards.find((c) => c.username === username);
    expect(card, 'профиль не попал в выдачу — тест не проверяет то, что должен').toBeTruthy();
    expect(card!.coverKey).toBe(`photos/${username}-0/original.jpg`);
  });
});
