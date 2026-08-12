import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { bestOfWeek, bestOfYear, editorsChoice, followingFeed, freshPhotos, recommendedFeed, type FeedPhoto } from '@/lib/feeds';
import { getSession } from '@/lib/auth';
import { webVariantUrl, avatarUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';
import { BASE_URL } from '@/lib/sitemap';
import { EmptyState } from '@/components/EmptyState';

export const metadata: Metadata = {
  title: ru.photoFeed.title,
  description: ru.photoFeed.metaDescription,
  alternates: { canonical: `${BASE_URL}/ru/photo` },
};
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
    <main className="mx-auto w-full max-w-7xl flex-1 sm:px-4 sm:py-8">
      <div className="max-w-6xl w-full">
      {/* Табы: sticky-полоса, горизонтальный скролл на мобиле (app-подача) */}
      <div className="sticky top-[57px] z-30 border-b border-line bg-paper/90 px-4 py-2.5 backdrop-blur-md sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <div className="hidden sm:block">
          <p className="t-caption muted" style={{ fontFamily: 'var(--font-mono)' }}>{ru.photoFeed.kicker}</p>
          <h1 className="t-title mt-1">{ru.photoFeed.title}</h1>
        </div>
        <nav className="flex gap-2 overflow-x-auto sm:mt-4 sm:flex-wrap">
          {TABS.map((t) => (
            <Link key={t.key} href={`/ru/photo?tab=${t.key}`}
              className={`chip shrink-0 ${active === t.key ? 'chip-active' : ''}`}>
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {note && <p className="px-4 pt-3 t-small muted sm:px-0">{note}</p>}
      {photos.length === 0 ? (
        <EmptyState
          icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 16l-5-5L5 19" /></svg>}
          title={ru.photoFeed.empty}
          subtitle={ru.photoFeed.emptySubtitle}
          action={{ href: '/ru/russia', label: ru.photoFeed.emptyAction }}
        />
      ) : (
        <>
          {/* Мобайл: одноколоночная лента full-bleed (Instagram-подача) */}
          <div className="flex flex-col gap-4 pt-2 sm:hidden">
            {photos.map((p) => (
              <Link key={p.photoId} href={`/ru/photographer/${p.username}`} className="block">
                <div className="flex items-center gap-2 px-4 py-2">
                  {p.avatarKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl(p.avatarKey)} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 t-fine font-semibold">
                      {p.firstName.slice(0, 1)}{p.lastName.slice(0, 1)}
                    </span>
                  )}
                  <span className="t-small font-medium">{p.firstName} {p.lastName}</span>
                </div>
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={webVariantUrl(p.storageKey)} alt="" loading="lazy"
                    width={p.width} height={p.height} className="w-full bg-cover bg-center"
                    style={p.blurData ? { backgroundImage: `url(${p.blurData})` } : undefined} />
                </div>
              </Link>
            ))}
          </div>
          {/* Десктоп: masonry-сетка */}
          <div className="mt-6 hidden columns-2 gap-3 sm:block md:columns-3 lg:columns-4">
            {photos.map((p) => (
              <Link key={p.photoId} href={`/ru/photographer/${p.username}`} className="group mb-3 block break-inside-avoid">
                <div className="relative overflow-hidden rounded-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={webVariantUrl(p.storageKey)} alt="" loading="lazy"
                    width={p.width} height={p.height}
                    className="w-full bg-cover bg-center transition duration-500 ease-out group-hover:scale-[1.03]"
                    style={p.blurData ? { backgroundImage: `url(${p.blurData})` } : undefined} />
                  {/* автор проступает снизу по наведению — не «серая подпись» под каждым */}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end bg-gradient-to-t from-black/55 to-transparent px-3 pb-2.5 pt-8 t-fine font-medium text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    {p.firstName} {p.lastName}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
      </div>
    </main>
  );
}

function unauthenticated(): never {
  redirect('/ru/login');
}
