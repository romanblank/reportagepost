import { db } from '@/lib/db';
import { CATEGORIES } from '@/lib/category-data';

// Discovery-слой главной: превью по категориям (MyWed-подача «выбери жанр»).

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

  const [counts, recent] = await Promise.all([
    db.photo.groupBy({ by: ['categoryId'], where: { status: 'APPROVED' }, _count: true }),
    db.photo.findMany({
      where: { status: 'APPROVED' },
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
