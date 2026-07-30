import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { catalogForCity, recommendedForCity, type CatalogCard } from '@/lib/catalog';
import { visitingCity } from '@/lib/travel';
import { cityNameRu } from '@/lib/geo-data';
import { CATEGORIES } from '@/lib/category-data';
import { thumbVariantUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';
import { EmptyState } from '@/components/EmptyState';
import { JsonLd } from '@/components/JsonLd';
import { CatalogCards, CategoryLinks } from '@/components/CatalogCards';
import { catalogItemListLd } from '@/lib/structured-data';

// SEO-страница каталога города (SSR). До S4 — под noindex (заголовок глобальный).
// ВНИМАНИЕ (аудит волны №2): страница читает searchParams (фильтры/пагинация) →
// Next рендерит её динамически, revalidate тут НЕ применяется. Кэш городских
// страниц вернём в S6 масштабирования (статический сегмент + клиентский фильтр).
export const dynamic = 'force-dynamic';

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
  // notFound → not-found UI. На force-dynamic статус остаётся 200 (soft-404, не
  // решено — см. CLAUDE.md; реальный 404 к S4).
  if (!city) notFound();
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
  searchParams: Promise<{ category?: string; date?: string; page?: string; maxPrice?: string }>;
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
  const maxPriceRub = Number(searchParams.maxPrice) > 0 ? Number(searchParams.maxPrice) : undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);

  // «Рекомендуемые» (буст-видимость подписки, soft-hybrid) — только на 1-й
  // странице без фильтров. Все запросы страницы — параллельно (force-dynamic).
  const showRecommended = page === 1 && !categorySlug && !availableOn && !maxPriceRub;
  const [{ cards, hasNext }, recommended, visiting] = await Promise.all([
    catalogForCity({
      citySlug: city.slug, categorySlug, availableOn, page,
      maxPackagePriceMinor: maxPriceRub ? maxPriceRub * 100 : undefined,
    }),
    showRecommended ? recommendedForCity(city.slug) : Promise.resolve([] as CatalogCard[]),
    page === 1 ? visitingCity(city.slug, availableOn) : Promise.resolve([]),
  ]);
  // Полку исключаем из основного merit-списка (без дублей); shown — всё показанное
  // на странице (для счётчика и JSON-LD).
  const recSet = new Set(recommended.map((c) => c.username));
  const mainCards = recommended.length ? cards.filter((c) => !recSet.has(c.username)) : cards;
  const shown = [...recommended, ...mainCards];
  const cityName = cityNameRu(city.slug);
  const basePath = `/ru/${params.country}/${params.city}`;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-10">
      {shown.length > 0 && (
        <JsonLd
          data={catalogItemListLd(
            ru.catalog.title(cityName),
            shown.map((c) => ({ username: c.username, name: `${c.firstName} ${c.lastName}` })),
          )}
        />
      )}
      <header className="border-b border-line pb-5">
        <h1 className="t-h1">{ru.catalog.title(cityName)}</h1>
        <p className="mt-1.5 text-sm muted">{ru.catalog.photographersCount(shown.length)}</p>
      </header>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[248px_1fr]">
        {/* Боковая панель фильтров (каталог v9) */}
        <aside className="space-y-6 rounded-lg border border-line bg-surface p-4 lg:sticky lg:top-20">
          <div>
            <h2 className="t-caption mb-2 muted">{ru.catalog.filterGenre}</h2>
            {/* Категории → path-роуты (SEO-перелинковка), вертикальным списком */}
            <CategoryLinks countrySlug={params.country} citySlug={params.city} activeCategory={categorySlug} vertical />
          </div>
          {/* Фильтр даты/цены — применяется ко всему каталогу */}
          <form method="get" className="space-y-3 border-t border-line pt-4">
            {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
            <label className="block text-sm">
              <span className="field-hint mt-0">{ru.catalog.availableOn}</span>
              <input type="date" name="date" defaultValue={searchParams.date ?? ''} className="input mt-1 w-full" />
            </label>
            <label className="block text-sm">
              <span className="field-hint mt-0">{ru.catalog.maxPrice}</span>
              <input type="number" name="maxPrice" min={0} step={1} inputMode="numeric"
                defaultValue={searchParams.maxPrice ?? ''} placeholder="₽" className="input mt-1 w-full" />
            </label>
            <button type="submit" className="btn btn-outline w-full">{ru.catalog.applyDate}</button>
          </form>
        </aside>

        {/* Результаты */}
        <div className="min-w-0">
      {recommended.length > 0 && (
        <section className="mt-7">
          <h2 className="flex items-center gap-2 text-lg font-medium text-recognition">{ru.catalog.recommendedTitle}</h2>
          <CatalogCards cards={recommended} cityName={cityName} />
        </section>
      )}

      {visiting.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-medium">{ru.catalog.visitingTitle}</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visiting.map((plan) => (
              <li key={plan.id} className="card border-dashed p-4">
                <Link href={`/ru/photographer/${plan.profile.username}`} className="block">
                  <span className="font-medium">
                    {plan.profile.user.firstName} {plan.profile.user.lastName}
                  </span>
                  <p className="mt-1 text-xs opacity-60">
                    {ru.catalog.travelFrom(cityNameRu(plan.profile.city.slug))} ·{' '}
                    {ru.catalog.travelDates(
                      plan.fromDate.toISOString().slice(0, 10),
                      plan.toDate.toISOString().slice(0, 10),
                    )}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-1 overflow-hidden rounded-lg">
                    {plan.profile.photos.slice(0, 3).map((ph) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={ph.id} src={thumbVariantUrl(ph.storageKey)} alt="" loading="lazy"
                        className="aspect-square w-full object-cover" />
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mainCards.length === 0 && recommended.length === 0 && visiting.length === 0 ? (
        <EmptyState
          icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>}
          title={ru.catalog.empty}
          subtitle={ru.catalog.emptyCta(cityName)}
          actions={[
            { href: '/ru/register', label: ru.catalog.emptyRegister, variant: 'accent' },
            { href: '/ru/inquiry', label: ru.catalog.emptyInquiry, variant: 'outline' },
          ]}
        />
      ) : mainCards.length === 0 ? null : (
        <>
          {recommended.length > 0 && <h2 className="mt-8 text-lg font-medium">{ru.catalog.allInCity}</h2>}
          <CatalogCards cards={mainCards} cityName={cityName} />
        </>
      )}

      {(page > 1 || hasNext) && (
        <nav className="mt-8 flex justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(basePath, categorySlug, searchParams.date, searchParams.maxPrice, page - 1)}
              className="btn btn-outline">← {ru.catalog.prevPage}</Link>
          ) : <span />}
          {hasNext ? (
            <Link href={pageHref(basePath, categorySlug, searchParams.date, searchParams.maxPrice, page + 1)}
              className="btn btn-outline">{ru.catalog.nextPage} →</Link>
          ) : <span />}
        </nav>
      )}
        </div>
      </div>
    </main>
  );
}

function pageHref(base: string, category?: string, date?: string, maxPrice?: string, page?: number): string {
  const q = new URLSearchParams();
  if (category) q.set('category', category);
  if (date) q.set('date', date);
  if (maxPrice) q.set('maxPrice', maxPrice);
  if (page && page > 1) q.set('page', String(page));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
