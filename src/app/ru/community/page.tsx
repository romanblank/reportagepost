import type { Metadata } from 'next';
import Link from 'next/link';
import { communityStats, recentPhotographers, valuedPhotographers } from '@/lib/widgets';
import { bestOfWeek } from '@/lib/feeds';
import { cityNameRu } from '@/lib/geo-data';
import { webVariantUrl, thumbVariantUrl, avatarUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.dashboard.title };
// dynamic: страница лезет в БД (виджеты) — статический пререндер в Docker-билде
// падал без DATABASE_URL (урок ре-аудита 2026-07-14). Кэш вернём в S6 масштаба.
export const dynamic = 'force-dynamic';

export default async function CommunityPage() {
  const [stats, recent, best, valued] = await Promise.all([
    communityStats(),
    recentPhotographers(),
    bestOfWeek(12),
    valuedPhotographers(),
  ]);

  const tiles = [
    { label: ru.dashboard.statPhotographers(stats.photographers), value: stats.photographers },
    { label: ru.dashboard.statPhotos(stats.photos), value: stats.photos },
    { label: ru.dashboard.statCities(stats.cities), value: stats.cities },
    { label: ru.dashboard.statStories, value: stats.stories },
  ].filter((t) => t.value > 0);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-14">
      <h1 className="t-h1">{ru.dashboard.title}</h1>

      <div className="mt-6 flex flex-wrap gap-x-12 gap-y-4 border-y border-line py-6">
        {tiles.map((t) => (
          <div key={t.label}>
            <div className="tnum text-3xl font-semibold leading-none sm:text-4xl">{t.value}</div>
            <div className="t-caption mt-2 muted">{t.label}</div>
          </div>
        ))}
      </div>

      {valued.length > 0 && (
        <section className="mt-8">
          <h2 className="t-h3">{ru.dashboard.valuedTitle}</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {valued.map((p) => (
              <li key={p.username}>
                <Link href={`/ru/photographer/${p.username}`} className="flex items-center gap-3 card p-3">
                  {p.avatarKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl(p.avatarKey)} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold">
                      {p.firstName.slice(0, 1)}{p.lastName.slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.firstName} {p.lastName}</span>
                    <span className="text-sm muted">{ru.dashboard.recommendCount(p.recommendCount)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium">{ru.dashboard.recentTitle}</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((p) => (
              <li key={p.id} className="card p-3">
                <Link href={`/ru/photographer/${p.username}`} className="block">
                  {p.photos[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbVariantUrl(p.photos[0].storageKey)} alt="" loading="lazy"
                      className="aspect-video w-full rounded-lg object-cover" />
                  )}
                  <span className="mt-2 block font-medium">{p.user.firstName} {p.user.lastName}</span>
                  <span className="text-xs muted">{cityNameRu(p.city.slug)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {best.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium">{ru.dashboard.bestWeekTitle}</h2>
          <div className="mt-3 columns-2 gap-2 md:columns-3 lg:columns-4">
            {best.map((p) => (
              <Link key={p.photoId} href={`/ru/photographer/${p.username}`} className="mb-2 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={webVariantUrl(p.storageKey)} alt="" loading="lazy"
                  width={p.width} height={p.height} className="w-full rounded-lg" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
