import type { Metadata } from 'next';
import Link from 'next/link';
import { bestOfWeek, bestOfYear, editorsChoice, freshPhotos, type FeedPhoto } from '@/lib/feeds';
import { webVariantUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.photoFeed.title };
export const revalidate = 300;

const TABS = [
  { key: 'week', label: ru.photoFeed.tabWeek },
  { key: 'year', label: ru.photoFeed.tabYear },
  { key: 'editors', label: ru.photoFeed.tabEditors },
  { key: 'fresh', label: ru.photoFeed.tabFresh },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default async function PhotoFeedPage(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await props.searchParams;
  const active: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : 'week';

  let photos: FeedPhoto[];
  let fallbackNote = false;
  if (active === 'week') photos = await bestOfWeek();
  else if (active === 'year') photos = await bestOfYear();
  else if (active === 'editors') photos = await editorsChoice();
  else photos = await freshPhotos();

  // Честный фолбэк малых данных: пустая алгоритмическая лента → свежие
  if (photos.length === 0 && (active === 'week' || active === 'year')) {
    photos = await freshPhotos();
    fallbackNote = photos.length > 0;
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{ru.photoFeed.title}</h1>
      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/ru/photo?tab=${t.key}`}
            className={`rounded-full border px-3 py-1 ${active === t.key ? 'bg-foreground text-background' : ''}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {fallbackNote && <p className="mt-3 text-sm opacity-60">{ru.photoFeed.freshFallback}</p>}
      {photos.length === 0 ? (
        <p className="mt-10 text-center opacity-60">{ru.photoFeed.empty}</p>
      ) : (
        <div className="mt-6 columns-2 gap-2 md:columns-3 lg:columns-4">
          {photos.map((p) => (
            <Link key={p.photoId} href={`/ru/photographer/${p.username}`} className="mb-2 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={webVariantUrl(p.storageKey)} alt="" loading="lazy"
                width={p.width} height={p.height} className="w-full rounded-lg" />
              <span className="text-xs opacity-60">{p.firstName} {p.lastName}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
