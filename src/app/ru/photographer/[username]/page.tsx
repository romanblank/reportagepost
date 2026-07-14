import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { webVariantUrl } from '@/lib/photos';
import Link from 'next/link';
import { formatRubMinor } from '@/lib/money';
import { ru } from '@/i18n/ru';
import { getSession } from '@/lib/auth';
import { FavoriteButton, FollowButton, LikeButton, MessageButton } from '@/components/EngagementButtons';
import { LightboxGallery } from '@/components/Lightbox';

// dynamic: страница показывает состояние лайков/подписки текущего пользователя
export const dynamic = 'force-dynamic';

// «был онлайн …» из lastSeenAt (UTC). Грубые пороги, локаль ru.
function relativeOnline(lastSeen: Date | null): string | null {
  if (!lastSeen) return null;
  const mins = Math.floor((Date.now() - lastSeen.getTime()) / 60000);
  if (mins < 10) return 'сейчас онлайн';
  if (mins < 60) return `был ${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `был ${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `был ${days} дн назад`;
  return 'давно не заходил';
}

async function findProfile(username: string) {
  return db.photographerProfile.findFirst({
    where: { username, status: 'APPROVED' },
    include: {
      user: true,
      city: true,
      categories: { include: { category: true } },
      packages: { orderBy: { sortOrder: 'asc' } },
      photos: { where: { status: 'APPROVED' }, orderBy: { publishedAt: 'desc' }, take: 60 },
      stories: {
        where: { status: 'APPROVED' },
        orderBy: { publishedAt: 'desc' },
        include: { photos: { where: { status: 'APPROVED' }, take: 1 } },
      },
    },
  });
}

export async function generateMetadata(props: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await props.params;
  const profile = await findProfile(username);
  if (!profile) return { title: ru.profile.notFound };
  const title = `${profile.user.firstName} ${profile.user.lastName} — ${ru.catalog.title(cityNameRu(profile.city.slug))}`;
  return { title, description: profile.bio ?? title };
}

export default async function ProfilePage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;
  const profile = await findProfile(username);
  if (!profile) notFound();

  const session = await getSession();
  const favorited = session
    ? Boolean(
        await db.favoritePhotographer.findUnique({
          where: { userId_profileId: { userId: session.userId, profileId: profile.id } },
        }),
      )
    : false;
  const [likes, myLikes, following, followers, rankAbove] = await Promise.all([
    db.like.groupBy({
      by: ['photoId'],
      where: { photoId: { in: profile.photos.map((p) => p.id) } },
      _count: true,
    }),
    session
      ? db.like.findMany({
          where: { userId: session.userId, photoId: { in: profile.photos.map((p) => p.id) } },
          select: { photoId: true },
        })
      : Promise.resolve([]),
    session
      ? db.follow.findUnique({
          where: { followerId_followeeId: { followerId: session.userId, followeeId: profile.userId } },
        })
      : Promise.resolve(null),
    db.follow.count({ where: { followeeId: profile.userId } }),
    // Место в городе: сколько одобренных профилей города с рейтингом выше
    db.photographerProfile.count({
      where: { status: 'APPROVED', cityId: profile.cityId, ratingScore: { gt: profile.ratingScore } },
    }),
  ]);
  const likeCount = new Map(likes.map((l) => [l.photoId, l._count]));
  const likedSet = new Set(myLikes.map((l) => l.photoId));
  const isSelf = session?.userId === profile.userId;
  const cityRank = rankAbove + 1;
  const lastSeen = profile.user.lastSeenAt;
  const onlineText = relativeOnline(lastSeen);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <header className="border-b border-line pb-8">
        <h1 className="text-3xl font-semibold sm:text-4xl">
          {profile.user.firstName} {profile.user.lastName}
        </h1>
        <p className="mt-2 text-sm muted">
          {cityNameRu(profile.city.slug)} · {profile.categories.map((c) => categoryNameRu(c.category.slug)).join(' · ')}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span><b className="font-semibold">{cityRank}</b> <span className="muted">место в городе</span></span>
          <span><b className="font-semibold">{followers}</b> <span className="muted">подписчиков</span></span>
          <span><b className="font-semibold">{profile.photos.length}</b> <span className="muted">фото</span></span>
          {onlineText && <span className="muted">{onlineText}</span>}
        </div>
        {profile.bio && <p className="mt-4 max-w-2xl leading-relaxed">{profile.bio}</p>}
        {!isSelf && (
          <div className="mt-5 flex flex-wrap gap-2">
            <FollowButton userId={profile.userId} initialFollowing={Boolean(following)} authed={Boolean(session)} />
            <FavoriteButton userId={profile.userId} initialFavorited={favorited} authed={Boolean(session)} />
            <MessageButton userId={profile.userId} />
          </div>
        )}
      </header>

      {profile.packages.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest muted">{ru.profile.pricesTitle}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {profile.packages.map((pkg) => (
              <li key={pkg.id} className="rounded-full bg-surface-2 px-4 py-2 text-sm">
                {ru.catalog.packageLabel(pkg.hours, formatRubMinor(pkg.priceMinor))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.stories.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest muted">{ru.profile.storiesTitle}</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profile.stories.map((story) => (
              <li key={story.id} className="card card-hover overflow-hidden">
                <Link href={`/ru/story/${story.id}`} className="block">
                  {story.photos[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={webVariantUrl(story.photos[0].storageKey)} alt="" loading="lazy"
                      className="aspect-video w-full object-cover" />
                  )}
                  <span className="block p-3 font-medium">{story.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-widest muted">{ru.profile.portfolioTitle}</h2>
        <LightboxGallery images={profile.photos.map((p) => ({ src: webVariantUrl(p.storageKey), width: p.width, height: p.height }))}>
          {(open) => (
            <div className="mt-3 columns-2 gap-2 md:columns-3">
              {profile.photos.map((photo, i) => (
                <figure key={photo.id} className="group relative mb-2 break-inside-avoid">
                  {photo.editorsChoiceAt && (
                    <span className="absolute left-2 top-2 z-10 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-ink">
                      {ru.profile.editorsChoice}
                    </span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={webVariantUrl(photo.storageKey)}
                    alt=""
                    loading="lazy"
                    width={photo.width}
                    height={photo.height}
                    onClick={() => open(i)}
                    className="w-full cursor-zoom-in rounded-lg transition group-hover:brightness-95"
                  />
                  <figcaption className="mt-1">
                    <LikeButton
                      photoId={photo.id}
                      initialLiked={likedSet.has(photo.id)}
                      initialCount={likeCount.get(photo.id) ?? 0}
                      authed={Boolean(session)}
                    />
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </LightboxGallery>
      </section>
    </main>
  );
}
