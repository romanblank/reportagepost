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
    <main className="mx-auto w-full max-w-6xl flex-1 sm:px-4 sm:py-8">
      {/* Табы: sticky-полоса, горизонтальный скролл на мобиле (app-подача) */}
      <div className="sticky top-[57px] z-30 border-b border-line bg-paper/90 px-4 py-2.5 backdrop-blur-md sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <h1 className="hidden text-3xl font-semibold sm:block">{ru.photoFeed.title}</h1>
        <nav className="flex gap-2 overflow-x-auto sm:mt-4 sm:flex-wrap">
          {TABS.map((t) => (
            <Link key={t.key} href={`/ru/photo?tab=${t.key}`}
              className={`chip shrink-0 ${active === t.key ? 'chip-active' : ''}`}>
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {note && <p className="px-4 pt-3 text-sm muted sm:px-0">{note}</p>}
      {photos.length === 0 ? (
        <p className="mt-16 text-center muted">{ru.photoFeed.empty}</p>
      ) : (
        <>
          {/* Мобайл: одноколоночная лента full-bleed (Instagram-подача) */}
          <div className="flex flex-col gap-4 pt-2 sm:hidden">
            {photos.map((p) => (
              <Link key={p.photoId} href={`/ru/photographer/${p.username}`} className="block">
                <div className="flex items-center gap-2 px-4 py-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-xs font-semibold">
                    {p.firstName.slice(0, 1)}{p.lastName.slice(0, 1)}
                  </span>
                  <span className="text-sm font-medium">{p.firstName} {p.lastName}</span>
                </div>
                <div className="relative">
                  {(active === 'week' || active === 'year') && p.scoreMilli > 0 && (
                    <span className="absolute left-3 top-3 z-10 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-ink">
                      {active === 'week' ? ru.photoFeed.badgeWeek : ru.photoFeed.badgeYear}
                    </span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={webVariantUrl(p.storageKey)} alt="" loading="lazy"
                    width={p.width} height={p.height} className="w-full" />
                </div>
              </Link>
            ))}
          </div>
          {/* Десктоп: masonry-сетка */}
          <div className="mt-6 hidden columns-2 gap-3 sm:block md:columns-3 lg:columns-4">
            {photos.map((p) => (
              <Link key={p.photoId} href={`/ru/photographer/${p.username}`} className="group mb-3 block break-inside-avoid">
                <div className="relative overflow-hidden rounded-lg">
                  {(active === 'week' || active === 'year') && p.scoreMilli > 0 && (
                    <span className="absolute left-2 top-2 z-10 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-ink">
                      {active === 'week' ? ru.photoFeed.badgeWeek : ru.photoFeed.badgeYear}
                    </span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={webVariantUrl(p.storageKey)} alt="" loading="lazy"
                    width={p.width} height={p.height}
                    className="w-full transition duration-300 group-hover:scale-[1.02]" />
                </div>
                <span className="mt-1 block text-xs muted">{p.firstName} {p.lastName}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function unauthenticated(): never {
  redirect('/ru/login');
}
