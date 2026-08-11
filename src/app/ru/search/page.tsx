import type { Metadata } from 'next';
import Link from 'next/link';
import { searchPhotographers } from '@/lib/search';
import { cityNameRu, RU_CITIES } from '@/lib/geo-data';
import { categoryNameRu, CATEGORIES } from '@/lib/category-data';
import { thumbVariantUrl, avatarUrl } from '@/lib/photos';
import { VerifiedBadge } from '@/components/ui/Badge';
import { ru } from '@/i18n/ru';
import { BASE_URL } from '@/lib/sitemap';

export const metadata: Metadata = {
  title: ru.search.title,
  description: ru.search.metaDescription,
  alternates: { canonical: `${BASE_URL}/ru/search` },
};
export const dynamic = 'force-dynamic';

// Поиск (аудит 2026-08-01, P2). Было: 24 результата без пагинации и фильтров,
// без устойчивости к опечатке. Стало: похожесть по триграммам, исправление
// раскладки, фильтры город+жанр, честное «показано N из M» и постраничность —
// ссылками, чтобы результат оставался разделяемым и работал без JS.
export default async function SearchPage(props: {
  searchParams: Promise<{ q?: string; city?: string; category?: string; page?: string }>;
}) {
  const sp = await props.searchParams;
  const query = (sp.q ?? '').trim();
  const citySlug = sp.city || undefined;
  const categorySlug = sp.category || undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const result = query.length >= 2
    ? await searchPhotographers(query, { citySlug, categorySlug, page })
    : null;

  const pageHref = (next: number) => {
    const params = new URLSearchParams({ q: query });
    if (citySlug) params.set('city', citySlug);
    if (categorySlug) params.set('category', categorySlug);
    if (next > 1) params.set('page', String(next));
    return `/ru/search?${params.toString()}`;
  };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-10">
      <div className="max-w-6xl w-full">
      <h1 className="t-title">{ru.search.title}</h1>

      <form method="get" className="mt-6 flex flex-wrap gap-2">
        <input name="q" defaultValue={query} placeholder={ru.search.placeholder}
          autoFocus className="input max-w-md" />
        <select name="city" defaultValue={citySlug ?? ''} className="input max-w-[12rem]"
          aria-label={ru.search.allCities}>
          <option value="">{ru.search.allCities}</option>
          {RU_CITIES.map((c) => (
            <option key={c.slug} value={c.slug}>{c.nameRu}</option>
          ))}
        </select>
        <select name="category" defaultValue={categorySlug ?? ''} className="input max-w-[14rem]"
          aria-label={ru.search.allCategories}>
          <option value="">{ru.search.allCategories}</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>{categoryNameRu(c.slug)}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-accent px-5">{ru.search.apply}</button>
      </form>

      {!result ? (
        <p className="mt-8 muted">{ru.search.hint}</p>
      ) : result.items.length === 0 ? (
        <p className="mt-8 muted">{ru.search.empty}</p>
      ) : (
        <>
          <p className="mt-6 text-sm muted">
            {ru.search.found(result.items.length + (result.page - 1) * result.pageSize, result.total)}
            {result.correctedQuery && ` · ${ru.search.corrected(result.correctedQuery)}`}
          </p>

          <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((r) => (
              <li key={r.username} className="card card-hover overflow-hidden">
                <Link href={`/ru/photographer/${r.username}`} className="block">
                  {r.photoKeys.length > 0 && (
                    <div className="grid grid-cols-3 gap-px bg-line">
                      {r.photoKeys.slice(0, 3).map((key) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={key} src={thumbVariantUrl(key)} alt="" loading="lazy"
                          className="aspect-square w-full object-cover" />
                      ))}
                    </div>
                  )}
                  <div className="p-4">
                    <span className="flex items-center gap-2 font-medium">
                      {r.avatarKey ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl(r.avatarKey)} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-xs">
                          {r.firstName.slice(0, 1)}{r.lastName.slice(0, 1)}
                        </span>
                      )}
                      <span className="truncate">{r.firstName} {r.lastName}</span>
                      {r.verified && <VerifiedBadge label={ru.profile.verified} size={15} />}
                    </span>
                    {r.reviewCount > 0 && (
                      <p className="mt-1 text-sm muted">{ru.reviews.count(r.reviewCount)}</p>
                    )}
                    <p className="mt-1 text-sm muted">
                      {cityNameRu(r.citySlug)} · {r.categories.map((c) => categoryNameRu(c)).join(' · ')}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Постраничность ссылками: результат можно переслать, и он работает без JS */}
          {(result.page > 1 || result.hasNext) && (
            <nav className="mt-8 flex items-center justify-center gap-3">
              {result.page > 1 && (
                <Link href={pageHref(result.page - 1)} className="btn btn-outline btn-sm">←</Link>
              )}
              <span className="text-sm muted tnum">{result.page}</span>
              {result.hasNext && (
                <Link href={pageHref(result.page + 1)} className="btn btn-outline btn-sm">{ru.search.more}</Link>
              )}
            </nav>
          )}
        </>
      )}
      </div>
    </main>
  );
}
