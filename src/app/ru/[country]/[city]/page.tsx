import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { catalogForCity } from '@/lib/catalog';
import { visitingCity } from '@/lib/travel';
import { cityNameRu } from '@/lib/geo-data';
import { CATEGORIES, categoryNameRu } from '@/lib/category-data';
import { thumbVariantUrl } from '@/lib/photos';
import { formatRubMinor } from '@/lib/money';
import { ru } from '@/i18n/ru';
import { Avatar } from '@/components/ui/Avatar';
import { Rating } from '@/components/ui/Rating';
import { VerifiedBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/EmptyState';
import { JsonLd } from '@/components/JsonLd';
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

  const { cards, hasNext } = await catalogForCity({
    citySlug: city.slug, categorySlug, availableOn, page,
    maxPricePerHourMinor: maxPriceRub ? maxPriceRub * 100 : undefined,
  });
  // Приезжие фотографы — только на первой странице, под фильтром
  const visiting = page === 1 ? await visitingCity(city.slug, availableOn) : [];
  const cityName = cityNameRu(city.slug);
  const basePath = `/ru/${params.country}/${params.city}`;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
      {cards.length > 0 && (
        <JsonLd
          data={catalogItemListLd(
            cityName,
            cards.map((c) => ({ username: c.username, name: `${c.firstName} ${c.lastName}` })),
          )}
        />
      )}
      <h1 className="t-h1">{ru.catalog.title(cityName)}</h1>
      <p className="mt-1.5 text-sm muted">{ru.catalog.photographersCount(cards.length)}</p>

      {/* Категории: горизонтальный скролл на мобиле (app-подача), обёртка edge-to-edge */}
      <nav className="mt-5 -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href={basePath} className={`chip shrink-0 ${!categorySlug ? 'chip-active' : ''}`}>
          {ru.catalog.allCategories}
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c.slug} href={`${basePath}?category=${c.slug}`}
            className={`chip shrink-0 ${categorySlug === c.slug ? 'chip-active' : ''}`}>
            {c.nameRu}
          </Link>
        ))}
      </nav>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
        <label className="text-sm">
          <span className="field-hint mt-0">{ru.catalog.availableOn}</span>
          <input type="date" name="date" defaultValue={searchParams.date ?? ''} className="input mt-1 w-auto" />
        </label>
        <label className="text-sm">
          <span className="field-hint mt-0">{ru.catalog.maxPrice}</span>
          <input type="number" name="maxPrice" min={0} step={1} inputMode="numeric"
            defaultValue={searchParams.maxPrice ?? ''} placeholder="₽/час" className="input mt-1 w-32" />
        </label>
        <button type="submit" className="btn btn-outline px-4 py-2.5">{ru.catalog.applyDate}</button>
      </form>

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

      {cards.length === 0 && visiting.length === 0 ? (
        <EmptyState
          icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>}
          title={ru.catalog.empty}
          subtitle={ru.catalog.emptyCta(cityName)}
          actions={[
            { href: '/ru/register', label: ru.catalog.emptyRegister, variant: 'accent' },
            { href: '/ru/inquiry', label: ru.catalog.emptyInquiry, variant: 'outline' },
          ]}
        />
      ) : cards.length === 0 ? null : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.username} className="card card-hover overflow-hidden">
              <Link href={`/ru/photographer/${card.username}`} className="block">
                {card.photoKeys.length > 0 && (
                  <div className="grid grid-cols-3 gap-px bg-line">
                    {card.photoKeys.slice(0, 3).map((key) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={key} src={thumbVariantUrl(key)} alt="" loading="lazy"
                        className="aspect-square w-full object-cover" />
                    ))}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <Avatar avatarKey={card.avatarKey} firstName={card.firstName} lastName={card.lastName} size={28} />
                      <span className="truncate">{card.firstName} {card.lastName}</span>
                      {card.verified && <VerifiedBadge label={ru.profile.verified} size={16} />}
                    </span>
                    {card.minPackage && (
                      <span className="text-sm muted">
                        {ru.catalog.packageLabel(card.minPackage.hours, formatRubMinor(card.minPackage.priceMinor))}
                      </span>
                    )}
                  </div>
                  {card.ratingCount > 0 && (
                    <div className="mt-1.5">
                      <Rating value={card.ratingAvg} count={card.ratingCount} size="sm" />
                    </div>
                  )}
                  {card.bio && <p className="mt-1 line-clamp-2 text-sm muted">{card.bio}</p>}
                  <p className="mt-2 text-xs muted opacity-70">
                    {card.categories.map((slug) => categoryNameRu(slug)).join(' · ')}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
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
