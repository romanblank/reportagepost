import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { bestOfWeek, bestOfYear, editorsChoice, followingFeed, freshPhotos, recommendedFeed, type FeedPhoto } from '@/lib/feeds';
import { getSession } from '@/lib/auth';
import { webVariantUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.photoFeed.title };
// Персональные табы требуют сессии — рендерим динамически
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'forYou', label: ru.photoFeed.tabForYou },
  { key: 'following', label: ru.photoFeed.tabFollowing },
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
  const session = await getSession();
  const active: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : session ? 'forYou' : 'week';

  let photos: FeedPhoto[];
  let note: string | null = null;

  if (active === 'forYou') {
    if (!session) return unauthenticated();
    const rec = await recommendedFeed(session.userId);
    photos = rec.photos;
    if (!rec.personalized && photos.length > 0) note = ru.photoFeed.forYouFallback;
  } else if (active === 'following') {
    if (!session) return unauthenticated();
    photos = await followingFeed(session.userId);
    if (photos.length === 0) note = ru.photoFeed.followingEmpty;
  } else if (active === 'week') photos = await bestOfWeek();
  else if (active === 'year') photos = await bestOfYear();
  else if (active === 'editors') photos = await editorsChoice();
  else photos = await freshPhotos();

  // Честный фолбэк малых данных для алгоритмических лент
  if (photos.length === 0 && (active === 'week' || active === 'year')) {
    photos = await freshPhotos();
    if (photos.length > 0) note = ru.photoFeed.freshFallback;
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <h1 className="text-3xl font-semibold">{ru.photoFeed.title}</h1>
      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/ru/photo?tab=${t.key}`}
            className={`chip ${active === t.key ? 'chip-active' : ''}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {note && <p className="mt-3 text-sm muted">{note}</p>}
      {photos.length === 0 ? (
        <p className="mt-16 text-center muted">{ru.photoFeed.empty}</p>
      ) : (
        <div className="mt-6 columns-2 gap-2 md:columns-3 lg:columns-4">
          {photos.map((p) => (
            <Link key={p.photoId} href={`/ru/photographer/${p.username}`} className="mb-2 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={webVariantUrl(p.storageKey)} alt="" loading="lazy"
                width={p.width} height={p.height} className="w-full rounded-lg" />
              <span className="text-xs muted">{p.firstName} {p.lastName}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

function unauthenticated(): never {
  redirect('/ru/login');
}
