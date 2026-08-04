import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { slugifyWithId } from '@/lib/slugify';
import { createId } from '@/lib/ids';
import { tierOf } from '@/lib/subscription';
import { ARTICLE_QUOTA, type PlanTier } from '@/lib/pricing';
import { assertCanPublish } from '@/lib/forum';
import { moderateText, MAX_LENGTH } from '@/lib/text-moderation';

/**
 * Статьи журнала.
 *
 * Право написать статью — перк подписки, но градация идёт по КОЛИЧЕСТВУ в
 * месяц, а не по факту доступа: право высказаться не продаётся. Бесплатный
 * уровень пишет одну статью в месяц, подписка снимает потолок постепенно.
 *
 * Статья, в отличие от сообщения форума, по умолчанию идёт человеку. Она живёт
 * в редакционном разделе, её видит заказчик, и цена ошибки автомата здесь
 * выше: пропущенная реклама под видом статьи бьёт по доверию ко всей площадке.
 */

export type ArticleOutcome = {
  status: 'PUBLISHED' | 'REJECTED' | 'IN_REVIEW';
  id: string;
  slug: string;
  reason?: string;
  quote?: string | null;
  /** Сколько статей осталось в этом месяце. */
  left: number;
};

/** Сколько статей автор уже подал за календарный месяц. */
export async function articlesThisMonth(userId: string, now: Date = new Date()): Promise<number> {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return db.article.count({
    where: { authorUserId: userId, createdAt: { gte: from }, status: { not: 'REJECTED' } },
  });
}

export function articleQuota(tier: PlanTier): number {
  return ARTICLE_QUOTA[tier];
}

export async function createArticle(
  userId: string,
  input: { title: string; lead: string; body: string; coverPhotoId?: string | null },
): Promise<ArticleOutcome> {
  const profile = await db.photographerProfile.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (profile?.status !== 'APPROVED') throw new DomainError('forbidden', 403);
  await assertCanPublish(userId);

  const tier = await tierOf(userId);
  const quota = articleQuota(tier);
  const used = await articlesThisMonth(userId);
  if (used >= quota) throw new DomainError('article_quota', 429);

  await rateLimit(`article:user:${userId}`, 10, 86_400);

  const title = input.title.trim().replace(/\s+/g, ' ');
  const lead = input.lead.trim();
  const body = input.body.trim();
  if (title.length < 10 || title.length > 140) throw new DomainError('validation', 400);
  if (lead.length < 40 || lead.length > 400) throw new DomainError('validation', 400);
  if (body.length > MAX_LENGTH.article) throw new DomainError('too_long', 400);

  // Обложку берём только из СВОИХ одобренных кадров: чужой кадр в шапке чужой
  // статьи — это кража, которую площадка обязана не допустить, а не разбирать
  // потом по жалобе
  let coverPhotoId: string | null = null;
  if (input.coverPhotoId) {
    const photo = await db.photo.findUnique({
      where: { id: input.coverPhotoId },
      select: { profileId: true, status: true },
    });
    if (!photo || photo.profileId !== profile.id || photo.status !== 'APPROVED') {
      throw new DomainError('cover_not_yours', 400);
    }
    coverPhotoId = input.coverPhotoId;
  }

  const verdict = await moderateText({ text: `${title}\n${lead}\n${body}`, kind: 'article' });

  // Отказ автомата остаётся отказом, всё остальное идёт человеку: статья —
  // редакционный материал, и «молча опубликовать» здесь неверно даже когда
  // претензий нет
  const status = verdict.action === 'reject' ? 'REJECTED' : 'IN_REVIEW';

  const id = createId();
  const slug = slugifyWithId(title, id);

  await db.article.create({
    data: {
      id,
      authorUserId: userId,
      title,
      lead,
      body,
      coverPhotoId,
      slug,
      status,
      reasonCode: 'reason' in verdict ? verdict.reason : null,
      reasonQuote: 'quote' in verdict ? verdict.quote : null,
    },
  });

  if (verdict.action === 'reject') {
    await db.contentViolation.create({ data: { userId, kind: 'article', reason: verdict.reason } });
  }

  return {
    status,
    id,
    slug,
    reason: 'reason' in verdict ? verdict.reason : undefined,
    quote: 'quote' in verdict ? verdict.quote : undefined,
    left: Math.max(0, quota - used - 1),
  };
}

export type ArticleCard = {
  slug: string;
  title: string;
  lead: string;
  publishedAt: Date;
  authorName: string;
  authorUsername: string | null;
  coverKey: string | null;
};

export async function publishedArticles(limit = 20): Promise<ArticleCard[]> {
  const rows = await db.article.findMany({
    where: { status: 'PUBLISHED', publishedAt: { not: null } },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: {
      slug: true, title: true, lead: true, publishedAt: true,
      cover: { select: { storageKey: true } },
      author: { select: { firstName: true, lastName: true, profile: { select: { username: true, status: true } } } },
    },
  });
  return rows.map((a) => ({
    slug: a.slug,
    title: a.title,
    lead: a.lead,
    publishedAt: a.publishedAt as Date,
    authorName: `${a.author.firstName} ${a.author.lastName}`,
    authorUsername: a.author.profile?.status === 'APPROVED' ? a.author.profile.username : null,
    coverKey: a.cover?.storageKey ?? null,
  }));
}

export type ArticleView = ArticleCard & { body: string };

export async function articleBySlug(slug: string): Promise<ArticleView | null> {
  const a = await db.article.findUnique({
    where: { slug },
    select: {
      slug: true, title: true, lead: true, body: true, publishedAt: true, status: true,
      cover: { select: { storageKey: true } },
      author: { select: { firstName: true, lastName: true, profile: { select: { username: true, status: true } } } },
    },
  });
  if (!a || a.status !== 'PUBLISHED' || !a.publishedAt) return null;
  return {
    slug: a.slug,
    title: a.title,
    lead: a.lead,
    body: a.body,
    publishedAt: a.publishedAt,
    authorName: `${a.author.firstName} ${a.author.lastName}`,
    authorUsername: a.author.profile?.status === 'APPROVED' ? a.author.profile.username : null,
    coverKey: a.cover?.storageKey ?? null,
  };
}

/**
 * Решение редакции по статье.
 *
 * Публикация проставляет дату: до неё статьи в журнале нет, даже если ссылку
 * кто-то угадал.
 */
export async function decideArticle(
  adminUserId: string,
  articleId: string,
  decision: { publish: true } | { publish: false; reason: string },
): Promise<void> {
  const article = await db.article.findUnique({ where: { id: articleId }, select: { status: true } });
  if (!article) throw new DomainError('not_found', 404);

  const { logAudit } = await import('@/lib/audit');
  await db.$transaction(async (tx) => {
    if (decision.publish) {
      await tx.article.update({
        where: { id: articleId },
        data: { status: 'PUBLISHED', publishedAt: new Date(), reasonCode: null, reasonQuote: null },
      });
    } else {
      await tx.article.update({
        where: { id: articleId },
        data: { status: 'REJECTED', reasonCode: decision.reason },
      });
    }
    await logAudit(tx, adminUserId, decision.publish ? 'article.publish' : 'article.reject', 'ARTICLE', articleId, {});
  });
}
