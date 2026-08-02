import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { catalogForCity, categoryCountsForCity, recommendedForCity, type CatalogCard } from '@/lib/catalog';
import { visitingCity } from '@/lib/travel';
import { RU_COUNTRY, cityNameRu } from '@/lib/geo-data';
import { CATEGORIES, categoryNameRu } from '@/lib/category-data';
import { thumbVariantUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';
import { formatDateRu } from '@/lib/date-format';
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

// Запрос дедуплицируется в пределах одного рендера (аудит 2026-08-01, P2).
// generateMetadata и сам компонент вызывают его независимо, а Prisma-вызовы
// Next не дедуплицирует (в отличие от fetch) — самая посещаемая страница
// платформы делала тяжёлый джойн ДВАЖДЫ на каждый заход. cache() из react
// уже применён так же к getSession (src/lib/auth.ts).
const findCity = cache(async (params: Params) => {
  return db.city.findFirst({
    where: { slug: params.city, country: { slug: params.country } },
    include: { country: true },
  });
});

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

/**
 * Ссылка на ту же выдачу без части фильтров (чипы «убрать фильтр»).
 * Собирается из текущих searchParams, поэтому снятие одного условия не сбрасывает
 * остальные — частая беда самодельных фильтров.
 */
function filterHref(params: Record<string, string | undefined>, basePath: string): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== 'page') qs.set(k, v);
  }
  const q = qs.toString();
  return q ? `${basePath}?${q}` : basePath;
}

export default async function CatalogPage(props: {
  params: Promise<Params>;
  searchParams: Promise<{
    category?: string; date?: string; page?: string;
    minPrice?: string; maxPrice?: string; format?: string; trusted?: string; sort?: string;
  }>;
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
  const minPriceRub = Number(searchParams.minPrice) > 0 ? Number(searchParams.minPrice) : undefined;
  const trustedOnly = searchParams.trusted === '1';
  const sort: 'merit' | 'priceAsc' | 'fresh' =
    searchParams.sort === 'priceAsc' || searchParams.sort === 'fresh' ? searchParams.sort : 'merit';
  const videoOnly = searchParams.format === 'video';
  const page = Math.max(1, Number(searchParams.page) || 1);

  // «Открыты для новых заказов» (буст-видимость подписки, soft-hybrid) — только на 1-й
  // странице без фильтров. Все запросы страницы — параллельно (force-dynamic).
  const showRecommended = page === 1 && !categorySlug && !availableOn && !maxPriceRub && !minPriceRub && !videoOnly && !trustedOnly;
  const hasActiveFilters = Boolean(categorySlug || availableOn || maxPriceRub || minPriceRub || videoOnly || trustedOnly);
  const [{ cards, hasNext }, recommended, visiting, categoryCounts] = await Promise.all([
    catalogForCity({
      citySlug: city.slug, categorySlug, availableOn, page, videoOnly,
      maxPackagePriceMinor: maxPriceRub ? maxPriceRub * 100 : undefined,
      minPackagePriceMinor: minPriceRub ? minPriceRub * 100 : undefined,
      withShootsOnly: trustedOnly,
      sort,
    }),
    showRecommended ? recommendedForCity(city.slug) : Promise.resolve([] as CatalogCard[]),
    page === 1 ? visitingCity(city.slug, availableOn) : Promise.resolve([]),
    categoryCountsForCity(city.slug),
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
      {/* Шапка каталога по прототипу v9: путь, крупный заголовок антиквой и
          честная строка «сколько авторов и что именно показано». Раньше здесь
          был только заголовок и число — человек не понимал, видит он весь
          город или срез по фильтрам. */}
      <nav aria-label={ru.catalog.breadcrumbLabel} className="text-sm muted">
        <Link href="/ru/russia" className="transition hover:text-ink">{ru.catalog.breadcrumbCatalog}</Link>
        <span> · {RU_COUNTRY.nameRu} · </span>
        <span className="text-ink">{cityName}</span>
      </nav>
      <header className="mt-3 border-b border-line pb-5">
        <h1 className="t-display">{ru.catalog.title(cityName)}</h1>
        <p className="mt-2 text-sm muted">
          <b className="tnum font-medium text-ink">{shown.length}</b> {ru.catalog.authorsWord(shown.length)}
          {hasActiveFilters && ` · ${ru.catalog.filteredHint}`}
        </p>
      </header>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[248px_1fr]">
        {/* Боковая панель фильтров (каталог v9) */}
        <aside className="space-y-5 rounded-lg border border-line bg-surface p-4 lg:sticky lg:top-20">
          <div>
            <h2 className="t-caption mb-2 muted" style={{ fontFamily: 'var(--font-mono)' }}>{ru.catalog.filterGenre}</h2>
            {/* Категории → path-роуты (SEO-перелинковка) со счётчиками: без чисел
                человек выбирает жанр вслепую и попадает в пустую выдачу */}
            <CategoryLinks countrySlug={params.country} citySlug={params.city}
              activeCategory={categorySlug} vertical counts={categoryCounts} />
          </div>

          <div className="border-t border-line pt-4">
            <h2 className="t-caption mb-2 muted" style={{ fontFamily: 'var(--font-mono)' }}>{ru.catalog.filterFormat}</h2>
            <div className="flex gap-2">
              <Link href={pageHref(basePath, categorySlug, searchParams.date, searchParams.maxPrice, 1)}
                className={`chip flex-1 justify-center ${!videoOnly ? 'chip-active' : ''}`}>{ru.catalog.formatAll}</Link>
              <Link href={pageHref(basePath, categorySlug, searchParams.date, searchParams.maxPrice, 1, 'video')}
                className={`chip flex-1 justify-center ${videoOnly ? 'chip-active' : ''}`}>{ru.catalog.formatVideo}</Link>
            </div>
          </div>

          {/* Цена диапазоном, дата и фильтр доверия — одной формой */}
          <form method="get" className="space-y-4 border-t border-line pt-4">
            {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
            {videoOnly && <input type="hidden" name="format" value="video" />}

            <div>
              <span className="t-caption muted" style={{ fontFamily: 'var(--font-mono)' }}>{ru.catalog.filterPrice}</span>
              <div className="mt-2 flex items-center gap-2">
                <input type="number" name="minPrice" min={0} step={1000} inputMode="numeric"
                  defaultValue={searchParams.minPrice ?? ''} placeholder={ru.catalog.priceFromPh}
                  className="input w-full text-sm" aria-label={ru.catalog.priceFromPh} />
                <span className="muted">—</span>
                <input type="number" name="maxPrice" min={0} step={1000} inputMode="numeric"
                  defaultValue={searchParams.maxPrice ?? ''} placeholder={ru.catalog.priceToPh}
                  className="input w-full text-sm" aria-label={ru.catalog.priceToPh} />
              </div>
            </div>

            <label className="block">
              <span className="t-caption muted" style={{ fontFamily: 'var(--font-mono)' }}>{ru.catalog.availableOn}</span>
              <input type="date" name="date" defaultValue={searchParams.date ?? ''} className="input mt-2 w-full text-sm" />
            </label>

            {/* Фильтр доверия: съёмки, подтверждённые ОБЕИМИ сторонами */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
              <span>{ru.catalog.filterTrusted}</span>
              <input type="checkbox" name="trusted" value="1" defaultChecked={trustedOnly}
                className="size-4 accent-[var(--accent)]" />
            </label>

            <button type="submit" className="btn btn-outline w-full">{ru.catalog.applyDate}</button>
          </form>

          {hasActiveFilters && (
            <Link href={basePath} className="block border-t border-line pt-4 text-sm text-accent hover:underline">
              {ru.catalog.resetFilters}
            </Link>
          )}
        </aside>

        {/* Результаты */}
        <div className="min-w-0">
          {/* Активные фильтры чипами (прототип v9): человек видит, ЧТО именно
              сузило выдачу, и снимает лишнее одним кликом — а не ищет, где он
              это включил. Каждый чип ведёт на ту же страницу без своего
              параметра, поэтому работает без JS. */}
          {/* Сортировка — ссылками (работает без JS и остаётся в адресе, значит
              выдачу можно переслать). Подписка ни в одном порядке не участвует:
              это способ заказчика посмотреть иначе, а не купить место. */}
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="t-caption muted" style={{ fontFamily: 'var(--font-mono)' }}>{ru.catalog.sortLabel}</span>
            {([
              ['merit', ru.catalog.sortMerit],
              ['priceAsc', ru.catalog.sortPrice],
              ['fresh', ru.catalog.sortFresh],
            ] as const).map(([key, label]) => (
              <Link key={key}
                href={filterHref({ ...searchParams, sort: key === 'merit' ? undefined : key }, basePath)}
                className={sort === key ? 'text-ink underline underline-offset-4' : 'muted hover:text-ink'}>
                {label}
              </Link>
            ))}
          </div>

          {hasActiveFilters && (
            <div className="mb-5 flex flex-wrap items-center gap-2" aria-label={ru.catalog.activeFiltersLabel}>
              {categorySlug && (
                <Link href={filterHref({ ...searchParams, category: undefined }, basePath)} className="chip chip-active">
                  {categoryNameRu(categorySlug)} ✕
                </Link>
              )}
              {videoOnly && (
                <Link href={filterHref({ ...searchParams, format: undefined }, basePath)} className="chip chip-active">
                  {ru.catalog.formatVideo} ✕
                </Link>
              )}
              {searchParams.date && (
                <Link href={filterHref({ ...searchParams, date: undefined }, basePath)} className="chip chip-active">
                  {ru.catalog.availableOn}: {searchParams.date} ✕
                </Link>
              )}
              {(minPriceRub || maxPriceRub) && (
                <Link href={filterHref({ ...searchParams, minPrice: undefined, maxPrice: undefined }, basePath)} className="chip chip-active">
                  {minPriceRub ? `${ru.catalog.priceFromPh} ${minPriceRub}` : ''}
                  {minPriceRub && maxPriceRub ? ' — ' : ''}
                  {maxPriceRub ? `${ru.catalog.priceToPh} ${maxPriceRub}` : ''} ₽ ✕
                </Link>
              )}
              {trustedOnly && (
                <Link href={filterHref({ ...searchParams, trusted: undefined }, basePath)} className="chip chip-active">
                  {ru.catalog.filterTrusted} ✕
                </Link>
              )}
            </div>
          )}
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
                      formatDateRu(plan.fromDate),
                      formatDateRu(plan.toDate),
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
        hasActiveFilters ? (
          // Под фильтры пусто (а не «в городе никого») — не сбиваем с толку CTA
          // регистрации; предлагаем сбросить фильтры.
          <EmptyState
            icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>}
            title={ru.catalog.emptyFiltered}
            subtitle={ru.catalog.emptyFilteredHint}
            actions={[{ href: basePath, label: ru.catalog.resetFilters, variant: 'accent' }]}
          />
        ) : (
          <EmptyState
            icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>}
            title={ru.catalog.empty}
            subtitle={ru.catalog.emptyCta(cityName)}
            actions={[
              { href: '/ru/register', label: ru.catalog.emptyRegister, variant: 'accent' },
              { href: '/ru/inquiry', label: ru.catalog.emptyInquiry, variant: 'outline' },
            ]}
          />
        )
      ) : mainCards.length === 0 ? null : (
        <>
          {recommended.length > 0 && <h2 className="mt-8 text-lg font-medium">{ru.catalog.allInCity}</h2>}
          <CatalogCards cards={mainCards} cityName={cityName} />
        </>
      )}

      {(page > 1 || hasNext) && (
        <nav className="mt-8 flex justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(basePath, categorySlug, searchParams.date, searchParams.maxPrice, page - 1, videoOnly ? 'video' : undefined)}
              className="btn btn-outline">← {ru.catalog.prevPage}</Link>
          ) : <span />}
          {hasNext ? (
            <Link href={pageHref(basePath, categorySlug, searchParams.date, searchParams.maxPrice, page + 1, videoOnly ? 'video' : undefined)}
              className="btn btn-outline">{ru.catalog.nextPage} →</Link>
          ) : <span />}
        </nav>
      )}
        </div>
      </div>
    </main>
  );
}

function pageHref(base: string, category?: string, date?: string, maxPrice?: string, page?: number, format?: string): string {
  const q = new URLSearchParams();
  if (category) q.set('category', category);
  if (date) q.set('date', date);
  if (maxPrice) q.set('maxPrice', maxPrice);
  if (format) q.set('format', format);
  if (page && page > 1) q.set('page', String(page));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
