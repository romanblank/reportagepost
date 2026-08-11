import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { catalogForCity } from '@/lib/catalog';
import { cityNameRu } from '@/lib/geo-data';
import { CATEGORIES, categoryNameRu } from '@/lib/category-data';
import { ru } from '@/i18n/ru';
import { BASE_URL } from '@/lib/sitemap';
import { EmptyState } from '@/components/EmptyState';
import { JsonLd } from '@/components/JsonLd';
import { CatalogCards, CategoryLinks } from '@/components/CatalogCards';
import { catalogItemListLd, breadcrumbLd } from '@/lib/structured-data';

// SEO-страница «город × категория» (path-роут, deep-think Marketing P0). Уникальные
// title/description/H1 + ItemList + BreadcrumbList. Под noindex до S4, включится с
// публичным запуском. Главный масштабируемый органический вход для спроса заказчиков.
export const dynamic = 'force-dynamic';

interface Params {
  country: string;
  city: string;
  category: string;
}

function validCategory(slug: string): boolean {
  return CATEGORIES.some((c) => c.slug === slug);
}

async function findCity(params: Params) {
  return db.city.findFirst({
    where: { slug: params.city, country: { slug: params.country } },
    include: { country: true },
  });
}

export async function generateMetadata(props: { params: Promise<Params> }): Promise<Metadata> {
  const params = await props.params;
  // notFound → рендерит not-found UI. ВНИМАНИЕ: на force-dynamic статус остаётся
  // 200 (soft-404, не решено — см. CLAUDE.md). Реальный 404 к S4 — middleware/иначе.
  if (!validCategory(params.category)) notFound();
  const city = await findCity(params);
  if (!city) notFound();
  const cityName = cityNameRu(city.slug);
  const catName = categoryNameRu(params.category);
  const count = await db.photographerProfile.count({
    where: { status: 'APPROVED', cityId: city.id, categories: { some: { category: { slug: params.category } } } },
  });
  return {
    title: ru.catalog.categoryTitle(catName, cityName),
    description: ru.catalog.categoryMetaDescription(catName, cityName, count),
    // Тот же довод, что у страницы города: фильтры и пагинация не должны
    // плодить самостоятельные адреса. Это главная страница входа по органике,
    // и распылять её вес особенно жаль.
    alternates: { canonical: `${BASE_URL}/ru/${params.country}/${params.city}/${params.category}` },
  };
}

export default async function CityCategoryPage(props: {
  params: Promise<Params>;
  searchParams: Promise<{ date?: string; page?: string; maxPrice?: string; format?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  if (!validCategory(params.category)) notFound();
  const city = await findCity(params);
  if (!city) notFound();

  const availableOn = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '')
    ? new Date(`${searchParams.date}T00:00:00Z`)
    : undefined;
  const maxPriceRub = Number(searchParams.maxPrice) > 0 ? Number(searchParams.maxPrice) : undefined;
  const videoOnly = searchParams.format === 'video';
  const page = Math.max(1, Number(searchParams.page) || 1);

  const { cards, hasNext } = await catalogForCity({
    citySlug: city.slug, categorySlug: params.category, availableOn, page, videoOnly,
    maxPackagePriceMinor: maxPriceRub ? maxPriceRub * 100 : undefined,
  });

  const cityName = cityNameRu(city.slug);
  const catName = categoryNameRu(params.category);
  const title = ru.catalog.categoryTitle(catName, cityName);
  const cityPath = `/ru/${params.country}/${params.city}`;
  const catPath = `${cityPath}/${params.category}`;

  const pageHref = (p: number, format?: string) => {
    const q = new URLSearchParams();
    if (searchParams.date) q.set('date', searchParams.date);
    if (searchParams.maxPrice) q.set('maxPrice', searchParams.maxPrice);
    if (format) q.set('format', format);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `${catPath}?${s}` : catPath;
  };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-10">
      <JsonLd data={breadcrumbLd([
        { name: ru.catalog.breadcrumbRoot, path: cityPath },
        { name: cityName, path: cityPath },
        { name: catName, path: catPath },
      ])} />
      {cards.length > 0 && (
        <JsonLd data={catalogItemListLd(title, cards.map((c) => ({ username: c.username, name: `${c.firstName} ${c.lastName}` })))} />
      )}

      <header className="border-b border-line pb-5">
        <nav className="text-sm muted">
          <Link href={cityPath} className="underline">{cityName}</Link> · {catName}
        </nav>
        <h1 className="t-title mt-1.5">{title}</h1>
        <p className="mt-1.5 text-sm muted">{ru.catalog.photographersCount(cards.length)}</p>
      </header>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[248px_1fr]">
        <aside className="space-y-6 rounded-media border border-line bg-surface p-4 lg:sticky lg:top-20">
          <div>
            <h2 className="t-caption mb-2 muted">{ru.catalog.filterGenre}</h2>
            <CategoryLinks countrySlug={params.country} citySlug={params.city} activeCategory={params.category} vertical />
          </div>
          <div className="border-t border-line pt-4">
            <h2 className="t-caption mb-2 muted">{ru.catalog.filterFormat}</h2>
            <div className="flex gap-2">
              <Link href={pageHref(1)} className={`chip flex-1 justify-center ${!videoOnly ? 'chip-active' : ''}`}>{ru.catalog.formatAll}</Link>
              <Link href={pageHref(1, 'video')} className={`chip flex-1 justify-center ${videoOnly ? 'chip-active' : ''}`}>{ru.catalog.formatVideo}</Link>
            </div>
          </div>
          <form method="get" className="space-y-3 border-t border-line pt-4">
            {videoOnly && <input type="hidden" name="format" value="video" />}
            <label className="block text-sm">
              <span className="field-hint mt-0">{ru.catalog.availableOn}</span>
              <input type="date" name="date" defaultValue={searchParams.date ?? ''} className="input mt-1 w-full" />
            </label>
            <label className="block text-sm">
              <span className="field-hint mt-0">{ru.catalog.maxPrice}</span>
              <input type="number" name="maxPrice" min={0} step={1} inputMode="numeric"
                defaultValue={searchParams.maxPrice ?? ''} placeholder={ru.ui.budgetPlaceholder} className="input mt-1 w-full" />
            </label>
            <button type="submit" className="btn btn-outline w-full">{ru.catalog.applyDate}</button>
          </form>
          <Link href={cityPath} className="block border-t border-line pt-4 text-sm text-accent hover:underline">
            ← {ru.catalog.resetFilters}
          </Link>
        </aside>

        <div className="min-w-0">
      {cards.length === 0 ? (
        // Страница всегда отфильтрована по жанру — предлагаем всех авторов города
        // (сброс) + заявку, а не сбивающую с толку регистрацию.
        <EmptyState
          icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>}
          title={ru.catalog.emptyFiltered}
          subtitle={ru.catalog.emptyFilteredHint}
          actions={[
            { href: cityPath, label: ru.catalog.resetFilters, variant: 'accent' },
            { href: '/ru/inquiry', label: ru.catalog.emptyInquiry, variant: 'outline' },
          ]}
        />
      ) : (
        <CatalogCards cards={cards} cityName={cityName} />
      )}

      {(page > 1 || hasNext) && (
        <nav className="mt-8 flex items-center justify-between">
          {page > 1 ? <Link href={pageHref(page - 1, videoOnly ? 'video' : undefined)} className="btn btn-outline px-4 py-2">{ru.catalog.prevPage}</Link> : <span />}
          {hasNext ? <Link href={pageHref(page + 1, videoOnly ? 'video' : undefined)} className="btn btn-outline px-4 py-2">{ru.catalog.nextPage}</Link> : <span />}
        </nav>
      )}
        </div>
      </div>
    </main>
  );
}
