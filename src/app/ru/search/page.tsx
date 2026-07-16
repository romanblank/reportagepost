import type { Metadata } from 'next';
import Link from 'next/link';
import { searchPhotographers } from '@/lib/search';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { thumbVariantUrl, avatarUrl } from '@/lib/photos';
import { VerifiedBadge } from '@/components/ui/Badge';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.search.title };
export const dynamic = 'force-dynamic';

export default async function SearchPage(props: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await props.searchParams;
  const query = (q ?? '').trim();
  const results = query.length >= 2 ? await searchPhotographers(query) : [];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="t-h1">{ru.search.title}</h1>
      <form method="get" className="mt-6 flex gap-2">
        <input name="q" defaultValue={query} placeholder={ru.search.placeholder}
          autoFocus className="input max-w-md" />
        <button type="submit" className="btn btn-accent px-5">{ru.search.title}</button>
      </form>

      {query.length < 2 ? (
        <p className="mt-8 muted">{ru.search.hint}</p>
      ) : results.length === 0 ? (
        <p className="mt-8 muted">{ru.search.empty}</p>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((r) => (
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
                  {r.ratingCount > 0 && (
                    <p className="mt-1 text-sm muted">{ru.reviews.count(r.ratingCount)}</p>
                  )}
                  <p className="mt-1 text-sm muted">
                    {cityNameRu(r.citySlug)} · {r.categories.map((c) => categoryNameRu(c)).join(' · ')}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
