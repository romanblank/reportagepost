import type { Metadata } from 'next';
import Link from 'next/link';
import { communityStats, recentPhotographers } from '@/lib/widgets';
import { bestOfWeek } from '@/lib/feeds';
import { cityNameRu } from '@/lib/geo-data';
import { webVariantUrl, thumbVariantUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.dashboard.title };
// dynamic: страница лезет в БД (виджеты) — статический пререндер в Docker-билде
// падал без DATABASE_URL (урок ре-аудита 2026-07-14). Кэш вернём в S6 масштаба.
export const dynamic = 'force-dynamic';

export default async function CommunityPage() {
  const [stats, recent, best] = await Promise.all([
    communityStats(),
    recentPhotographers(),
    bestOfWeek(12),
  ]);

  const tiles = [
    { label: ru.dashboard.statPhotographers, value: stats.photographers },
    { label: ru.dashboard.statPhotos, value: stats.photos },
    { label: ru.dashboard.statCities, value: stats.cities },
    { label: ru.dashboard.statStories, value: stats.stories },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{ru.dashboard.title}</h1>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border p-4">
            <div className="text-2xl font-semibold">{t.value}</div>
            <div className="text-sm opacity-60">{t.label}</div>
          </div>
        ))}
      </div>

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium">{ru.dashboard.recentTitle}</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((p) => (
              <li key={p.id} className="rounded-xl border p-3">
                <Link href={`/ru/photographer/${p.username}`} className="block">
                  {p.photos[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbVariantUrl(p.photos[0].storageKey)} alt="" loading="lazy"
                      className="aspect-video w-full rounded-lg object-cover" />
                  )}
                  <span className="mt-2 block font-medium">{p.user.firstName} {p.user.lastName}</span>
                  <span className="text-xs opacity-60">{cityNameRu(p.city.slug)}</span>
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
