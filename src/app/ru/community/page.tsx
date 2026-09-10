import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { communityStats, valuedPhotographers, communityGeo, communityGear } from '@/lib/widgets';
import { bestOfWeek } from '@/lib/feeds';
import { cityNameRu } from '@/lib/geo-data';
import { webVariantUrl, avatarUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';
import { BASE_URL } from '@/lib/sitemap';

export const metadata: Metadata = {
  title: ru.dashboard.title,
  description: ru.dashboard.metaDescription,
  alternates: { canonical: `${BASE_URL}/ru/community` },
};
// dynamic: страница лезет в БД (виджеты) — статический пререндер в Docker-билде
// падал без DATABASE_URL (урок ре-аудита 2026-07-14). Кэш вернём в S6 масштаба.
export const dynamic = 'force-dynamic';

// География и техника ходят по всем анкетам и группируют кадры — при
// force-dynamic это выполнялось на КАЖДЫЙ заход (аудит 2026-09-09, П2).
// Меняются они темпом появления авторов: часа кэша достаточно.
const cachedGeo = unstable_cache(() => communityGeo(), ['community-geo'], { revalidate: 3600, tags: ['catalog'] });
const cachedGear = unstable_cache(() => communityGear(), ['community-gear'], { revalidate: 3600, tags: ['catalog'] });

export default async function CommunityPage() {
  const [stats, best, valued, geo, gear] = await Promise.all([
    communityStats(),
    bestOfWeek(12),
    valuedPhotographers(),
    cachedGeo(),
    cachedGear(),
  ]);

  const tiles = [
    { label: ru.dashboard.statPhotographers(stats.photographers), value: stats.photographers },
    { label: ru.dashboard.statPhotos(stats.photos), value: stats.photos },
    { label: ru.dashboard.statCities(stats.cities), value: stats.cities },
    { label: ru.dashboard.statStories, value: stats.stories },
  ].filter((t) => t.value > 0);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:py-14">
      <div className="max-w-6xl w-full">
      <h1 className="t-h1">{ru.dashboard.title}</h1>

      {/* Без плиток блок не рендерится вовсе (design-polish, волна 2, High):
          после исключения демо из статистики нули оставляли пустую полосу
          между двух hairline-линий — читалось как сбой загрузки */}
      {tiles.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-x-12 gap-y-4 border-y border-line py-6">
          {tiles.map((t) => (
            <div key={t.label}>
              <div className="tnum t-metric" style={{ fontFamily: 'var(--font-display)' }}>{t.value}</div>
              <div className="t-caption mt-2 muted">{t.label}</div>
            </div>
          ))}
        </div>
      )}

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
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 t-small font-semibold">
                      {p.firstName.slice(0, 1)}{p.lastName.slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.firstName} {p.lastName}</span>
                    <span className="t-small muted">{ru.dashboard.recommendCount(p.recommendCount)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* «Новые в сообществе» отсюда убраны (партнёр 2026-08-18): их место —
          журнал, куда фотографы ходят чаще. Здесь — статистика для партнёров */}
      {geo.length > 0 && (
        <section className="mt-8">
          <h2 className="t-h3">{ru.dashboard.geoTitle}</h2>
          <p className="mt-1 t-small muted">{ru.dashboard.geoLead}</p>
          <ul className="mt-3 grid gap-x-10 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {geo.map((g) => (
              <li key={g.slug} className="flex items-baseline justify-between border-b border-line/60 pb-1.5">
                <span className="t-small">{cityNameRu(g.slug)}</span>
                <span className="tnum t-small font-semibold">{g.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gear.brands.length > 0 && (
        <section className="mt-8">
          <h2 className="t-h3">{ru.dashboard.gearTitle}</h2>
          <p className="mt-1 t-small muted">{ru.dashboard.gearLead}</p>
          <ul className="mt-3 grid gap-x-10 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {gear.brands.map((b) => (
              <li key={b.brand} className="flex items-baseline justify-between border-b border-line/60 pb-1.5">
                <span className="t-small">{b.brand}</span>
                <span className="tnum t-small font-semibold">{b.count}</span>
              </li>
            ))}
          </ul>
          {gear.topCameras.length > 0 && (
            <>
              <h3 className="mt-6 t-caption muted">{ru.dashboard.gearCamerasTitle}</h3>
              <ul className="mt-2 grid gap-x-10 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {gear.topCameras.map((c) => (
                  <li key={c.model} className="flex items-baseline justify-between border-b border-line/60 pb-1.5">
                    <span className="t-small truncate">{c.model}</span>
                    <span className="tnum t-small font-semibold">{c.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {best.length > 0 && (
        <section className="mt-8">
          <h2 className="t-title">{ru.dashboard.bestWeekTitle}</h2>
          <div className="mt-3 columns-2 gap-2 md:columns-3 lg:columns-4">
            {best.map((p) => (
              <Link key={p.photoId} href={`/ru/photographer/${p.username}`} className="mb-2 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={webVariantUrl(p.storageKey)} alt="" loading="lazy"
                  width={p.width} height={p.height} className="w-full rounded-media" />
              </Link>
            ))}
          </div>
        </section>
      )}
      </div>
    </main>
  );
}
