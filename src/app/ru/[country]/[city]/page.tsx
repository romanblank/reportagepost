import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { catalogForCity } from '@/lib/catalog';
import { cityNameRu } from '@/lib/geo-data';
import { CATEGORIES, categoryNameRu } from '@/lib/category-data';
import { thumbVariantUrl } from '@/lib/photos';
import { formatRubMinor } from '@/lib/money';
import { ru } from '@/i18n/ru';

// SEO-страница каталога города (SSR). До S4 — под noindex (заголовок глобальный).
// Кэш: ISR 10 минут — тысячи городских страниц не бьют в БД на каждый запрос.
export const revalidate = 600;

interface Params {
  country: string;
  city: string;
}

async function findCity(params: Params) {
  return db.city.findFirst({
    where: { slug: params.city, country: { slug: params.country } },
    include: { country: true },
  });
}

export async function generateMetadata(props: { params: Promise<Params> }): Promise<Metadata> {
  const params = await props.params;
  const city = await findCity(params);
  if (!city) return { title: ru.profile.notFound };
  const name = cityNameRu(city.slug);
  const count = await db.photographerProfile.count({
    where: { status: 'APPROVED', cityId: city.id },
  });
  return {
    title: ru.catalog.title(name),
    description: ru.catalog.metaDescription(name, count),
  };
}

export default async function CatalogPage(props: {
  params: Promise<Params>;
  searchParams: Promise<{ category?: string; date?: string; page?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const city = await findCity(params);
  if (!city) notFound();

  const categorySlug = CATEGORIES.some((c) => c.slug === searchParams.category)
    ? searchParams.category
    : undefined;
  const availableOn = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '')
    ? new Date(`${searchParams.date}T00:00:00Z`)
    : undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);

  const { cards, hasNext } = await catalogForCity({ citySlug: city.slug, categorySlug, availableOn, page });
  const cityName = cityNameRu(city.slug);
  const basePath = `/ru/${params.country}/${params.city}`;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {ru.catalog.title(cityName)}
      </h1>
      <p className="mt-1 text-sm opacity-60">{ru.catalog.photographersCount(cards.length)}</p>

      <form method="get" className="mt-3 flex items-center gap-2 text-sm">
        {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
        <label className="flex items-center gap-2">
          {ru.catalog.availableOn}
          <input type="date" name="date" defaultValue={searchParams.date ?? ''}
            className="rounded-lg border px-2 py-1" />
        </label>
        <button type="submit" className="rounded-lg border px-3 py-1">{ru.catalog.applyDate}</button>
      </form>

      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link
          href={basePath}
          className={`rounded-full border px-3 py-1 ${!categorySlug ? 'bg-foreground text-background' : ''}`}
        >
          {ru.catalog.allCategories}
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`${basePath}?category=${c.slug}`}
            className={`rounded-full border px-3 py-1 ${categorySlug === c.slug ? 'bg-foreground text-background' : ''}`}
          >
            {c.nameRu}
          </Link>
        ))}
      </nav>

      {cards.length === 0 ? (
        <p className="mt-12 text-center opacity-60">{ru.catalog.empty}</p>
      ) : (
        <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.username} className="rounded-xl border p-4">
              <Link href={`/ru/photographer/${card.username}`} className="block">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {card.firstName} {card.lastName}
                  </span>
                  {card.minPackage && (
                    <span className="text-sm opacity-70">
                      {ru.catalog.packageLabel(
                        card.minPackage.hours,
                        formatRubMinor(card.minPackage.priceMinor),
                      )}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm opacity-60">{card.bio}</p>
                <div className="mt-3 grid grid-cols-3 gap-1 overflow-hidden rounded-lg">
                  {card.photoKeys.slice(0, 6).map((key) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={key}
                      src={thumbVariantUrl(key)}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs opacity-50">
                  {card.categories.map((slug) => categoryNameRu(slug)).join(' · ')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasNext) && (
        <nav className="mt-8 flex justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(basePath, categorySlug, searchParams.date, page - 1)}
              className="rounded-lg border px-4 py-2">← {ru.catalog.prevPage}</Link>
          ) : <span />}
          {hasNext ? (
            <Link href={pageHref(basePath, categorySlug, searchParams.date, page + 1)}
              className="rounded-lg border px-4 py-2">{ru.catalog.nextPage} →</Link>
          ) : <span />}
        </nav>
      )}
    </main>
  );
}

function pageHref(base: string, category?: string, date?: string, page?: number): string {
  const q = new URLSearchParams();
  if (category) q.set('category', category);
  if (date) q.set('date', date);
  if (page && page > 1) q.set('page', String(page));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
