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

// dynamic: страница показывает состояние лайков/подписки текущего пользователя
export const dynamic = 'force-dynamic';

async function findProfile(username: string) {
  return db.photographerProfile.findFirst({
    where: { username, status: 'APPROVED' },
    include: {
      user: true,
      city: true,
      categories: { include: { category: true } },
      packages: { orderBy: { sortOrder: 'asc' } },
      photos: { where: { status: 'APPROVED' }, orderBy: { publishedAt: 'desc' } },
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
  const [likes, myLikes, following] = await Promise.all([
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
  ]);
  const likeCount = new Map(likes.map((l) => [l.photoId, l._count]));
  const likedSet = new Set(myLikes.map((l) => l.photoId));
  const isSelf = session?.userId === profile.userId;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {profile.user.firstName} {profile.user.lastName}
        </h1>
        <p className="mt-1 text-sm opacity-60">
          {ru.profile.cityLabel}: {cityNameRu(profile.city.slug)} ·{' '}
          {profile.categories.map((c) => categoryNameRu(c.category.slug)).join(' · ')}
        </p>
        {profile.bio && <p className="mt-3 max-w-2xl">{profile.bio}</p>}
        {!isSelf && (
          <div className="mt-4 flex flex-wrap gap-2">
            <FollowButton userId={profile.userId} initialFollowing={Boolean(following)} authed={Boolean(session)} />
            <FavoriteButton userId={profile.userId} initialFavorited={favorited} authed={Boolean(session)} />
            <MessageButton userId={profile.userId} />
          </div>
        )}
      </header>

      {profile.packages.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium">{ru.profile.pricesTitle}</h2>
          <ul className="mt-2 flex flex-wrap gap-3">
            {profile.packages.map((pkg) => (
              <li key={pkg.id} className="rounded-lg border px-4 py-2 text-sm">
                {ru.catalog.packageLabel(pkg.hours, formatRubMinor(pkg.priceMinor))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.stories.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium">{ru.profile.storiesTitle}</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profile.stories.map((story) => (
              <li key={story.id} className="rounded-xl border p-3">
                <Link href={`/ru/story/${story.id}`} className="block">
                  {story.photos[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={webVariantUrl(story.photos[0].storageKey)} alt="" loading="lazy"
                      className="aspect-video w-full rounded-lg object-cover" />
                  )}
                  <span className="mt-2 block font-medium">{story.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium">{ru.profile.portfolioTitle}</h2>
        <div className="mt-3 columns-2 gap-2 md:columns-3">
          {profile.photos.map((photo) => (
            <figure key={photo.id} className="mb-2 break-inside-avoid">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={webVariantUrl(photo.storageKey)}
                alt=""
                loading="lazy"
                width={photo.width}
                height={photo.height}
                className="w-full rounded-lg"
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
      </section>
    </main>
  );
}
