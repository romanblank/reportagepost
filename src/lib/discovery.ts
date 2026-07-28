import { db } from '@/lib/db';
import { CATEGORIES } from '@/lib/category-data';

// Discovery-слой главной: превью по категориям (MyWed-подача «выбери жанр»),
// свежие репортажи (серии — премиум-контент).

export interface StoryCard {
  id: string;
  title: string;
  coverKey: string | null;
  blurData: string | null;
  username: string;
  authorName: string;
}

/** Свежие опубликованные репортажи (серии) для витрины главной. */
export async function freshStories(limit = 6): Promise<StoryCard[]> {
  const stories = await db.story.findMany({
    // Только серии публичных (APPROVED) авторов — статус профиля не каскадит на
    // серию, иначе контент снятого с публикации автора всплыл бы на главной.
    where: { status: 'APPROVED', profile: { status: 'APPROVED' } },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    include: {
      profile: { include: { user: { select: { firstName: true, lastName: true } } } },
      photos: { where: { status: 'APPROVED' }, orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }], take: 1 },
    },
  });
  return stories.map((s) => ({
    id: s.id,
    title: s.title,
    coverKey: s.photos[0]?.storageKey ?? null,
    blurData: s.photos[0]?.blurhash ?? null,
    username: s.profile.username,
    authorName: `${s.profile.user.firstName} ${s.profile.user.lastName}`.trim(),
  }));
}

export interface CategoryPreview {
  slug: string;
  nameRu: string;
  coverKey: string | null; // репрезентативный кадр (выбор редакции → свежее)
  blurData: string | null;
  photoCount: number;
}

/** Для каждой из 6 категорий — обложка (свежий/редакционный кадр) и число работ. */
export async function categoryPreviews(): Promise<CategoryPreview[]> {
  const cats = await db.category.findMany({ select: { id: true, slug: true } });
  const idToSlug = new Map(cats.map((c) => [c.id, c.slug]));

  // Только фото публичных (APPROVED) авторов — обложки/счётчики жанров не должны
  // включать контент снятых с публикации профилей.
  const publicPhoto = { status: 'APPROVED' as const, profile: { status: 'APPROVED' as const } };
  const [counts, recent] = await Promise.all([
    db.photo.groupBy({ by: ['categoryId'], where: publicPhoto, _count: true }),
    db.photo.findMany({
      where: publicPhoto,
      orderBy: [{ editorsChoiceAt: 'desc' }, { publishedAt: 'desc' }],
      take: 300,
      select: { storageKey: true, blurhash: true, categoryId: true },
    }),
  ]);

  const countBySlug = new Map<string, number>();
  for (const c of counts) {
    const slug = idToSlug.get(c.categoryId);
    if (slug) countBySlug.set(slug, c._count);
  }
  const coverBySlug = new Map<string, { storageKey: string; blurhash: string | null }>();
  for (const p of recent) {
    const slug = idToSlug.get(p.categoryId);
    if (slug && !coverBySlug.has(slug)) coverBySlug.set(slug, { storageKey: p.storageKey, blurhash: p.blurhash });
  }

  // Порядок — по фиксированному сиду категорий (не по данным).
  return CATEGORIES.map((c) => ({
    slug: c.slug,
    nameRu: c.nameRu,
    coverKey: coverBySlug.get(c.slug)?.storageKey ?? null,
    blurData: coverBySlug.get(c.slug)?.blurhash ?? null,
    photoCount: countBySlug.get(c.slug) ?? 0,
  }));
}
