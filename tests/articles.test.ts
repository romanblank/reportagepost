import { describe, expect, it } from 'vitest';
import 'dotenv/config';
import { ARTICLE_QUOTA } from '@/lib/pricing';

const hasDb = Boolean(process.env.DATABASE_URL);

describe('квота статей', () => {
  it('право высказаться не продаётся: бесплатный уровень тоже пишет', () => {
    // Ноль на FREE превратил бы журнал в витрину подписки. Подписка меняет
    // количество, а не сам доступ к слову
    expect(ARTICLE_QUOTA.FREE).toBeGreaterThan(0);
    expect(ARTICLE_QUOTA.PRIME).toBeGreaterThan(ARTICLE_QUOTA.FREE);
    expect(ARTICLE_QUOTA.ELITE).toBeGreaterThan(ARTICLE_QUOTA.PRIME);
  });
});

describe.skipIf(!hasDb)('статьи журнала (БД)', () => {
  const LONG = 'Разбираю съёмку конференции на четыреста человек. '.repeat(20);

  async function makeAuthor(tag: string) {
    const { db } = await import('@/lib/db');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const user = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Автор', lastName: tag, email: `art-${tag}-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: user.id, username: `art-${tag}-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    return { user, profile };
  }

  async function cleanup(userId: string, profileId: string) {
    const { db } = await import('@/lib/db');
    await db.article.deleteMany({ where: { authorUserId: userId } });
    await db.contentViolation.deleteMany({ where: { userId } });
    await db.adminAudit.deleteMany({ where: { actorUserId: userId } });
    await db.profileCategoryScore.deleteMany({ where: { profileId } });
    await db.photographerProfile.delete({ where: { id: profileId } });
    await db.user.delete({ where: { id: userId } });
  }

  it('статья идёт человеку, а не публикуется молча', async () => {
    const { createArticle, articleBySlug } = await import('@/lib/articles');
    const { user, profile } = await makeAuthor('review');

    const out = await createArticle(user.id, {
      title: 'Как я снимал конференцию на четыреста человек',
      lead: 'Свет в зале был смешанный, спикеры двигались, а материал был нужен на следующее утро. Рассказываю, что сработало.',
      body: LONG,
    });

    // Журнал — редакционный раздел: «претензий нет» здесь не равно
    // «опубликовать», иначе первая же скрытая реклама выйдет от нашего имени
    expect(out.status).toBe('IN_REVIEW');
    expect(await articleBySlug(out.slug)).toBeNull();

    await cleanup(user.id, profile.id);
  });

  it('после решения редакции статья появляется в журнале', async () => {
    const { createArticle, articleBySlug, decideArticle, publishedArticles } = await import('@/lib/articles');
    const { db } = await import('@/lib/db');
    const { user, profile } = await makeAuthor('publish');
    const admin = await db.user.create({
      data: { role: 'ADMIN', status: 'ACTIVE', firstName: 'Ред', lastName: 'Актор', email: `adm-${Date.now()}@test.local` },
    });

    const out = await createArticle(user.id, {
      title: 'Три ошибки на репортажной съёмке в помещении',
      lead: 'Каждая из них стоила мне кадров, которые нельзя переснять. Разбираю по шагам, что делать вместо этого.',
      body: LONG,
    });
    await decideArticle(admin.id, out.id, { publish: true });

    const view = await articleBySlug(out.slug);
    expect(view?.title).toContain('Три ошибки');
    expect((await publishedArticles(500)).some((a) => a.slug === out.slug)).toBe(true);

    await db.adminAudit.deleteMany({ where: { actorUserId: admin.id } });
    await db.user.delete({ where: { id: admin.id } });
    await cleanup(user.id, profile.id);
  });

  it('месячная квота исчерпывается и не обходится повторной подачей', async () => {
    const { createArticle } = await import('@/lib/articles');
    const { user, profile } = await makeAuthor('quota');

    // FREE: одна статья в месяц
    await createArticle(user.id, {
      title: 'Первая статья этого месяца про свет',
      lead: 'Разбираю, как ставлю свет на репортаже в тёмном зале и почему отказался от накамерной вспышки.',
      body: LONG,
    });
    await expect(
      createArticle(user.id, {
        title: 'Вторая статья этого же месяца подряд',
        lead: 'Ещё один текст в том же месяце — квота уже израсходована, и подача должна быть отклонена.',
        body: LONG,
      }),
    ).rejects.toThrow();

    await cleanup(user.id, profile.id);
  });

  it('чужой кадр обложкой поставить нельзя', async () => {
    const { createArticle } = await import('@/lib/articles');
    const { db } = await import('@/lib/db');
    const mine = await makeAuthor('cover-mine');
    const other = await makeAuthor('cover-other');
    const category = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });
    const foreign = await db.photo.create({
      data: {
        profileId: other.profile.id, categoryId: category.id, status: 'APPROVED',
        storageKey: `test/cover-${Date.now()}/original.jpg`, width: 100, height: 100,
      },
    });

    // Кража обложки должна быть невозможна, а не разбираема по жалобе
    await expect(
      createArticle(mine.user.id, {
        title: 'Статья с чужой обложкой на первом экране',
        lead: 'Текст мой, а кадр в шапке чужой — платформа обязана не допустить этого до публикации.',
        body: LONG,
        coverPhotoId: foreign.id,
      }),
    ).rejects.toThrow();

    await db.photo.delete({ where: { id: foreign.id } });
    await cleanup(mine.user.id, mine.profile.id);
    await cleanup(other.user.id, other.profile.id);
  });
});
