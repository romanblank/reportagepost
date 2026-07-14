import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { webVariantUrl, thumbVariantUrl, avatarUrl } from '@/lib/photos';
import Link from 'next/link';
import { formatRubMinor } from '@/lib/money';
import { ru } from '@/i18n/ru';
import { getSession } from '@/lib/auth';
import { FavoriteButton, FollowButton, MessageButton } from '@/components/EngagementButtons';
import { PortfolioGallery } from '@/components/PortfolioGallery';
import { JsonLd } from '@/components/JsonLd';
import { personLd } from '@/lib/structured-data';
import { BASE_URL } from '@/lib/sitemap';
import { ReviewSection } from '@/components/ReviewSection';
import { reviewsForProfile } from '@/lib/reviews';

// dynamic: страница показывает состояние лайков/подписки текущего пользователя
export const dynamic = 'force-dynamic';

// «был онлайн …» из lastSeenAt (UTC). Грубые пороги, локаль ru.
function relativeOnline(lastSeen: Date | null): string | null {
  if (!lastSeen) return null;
  const mins = Math.floor((Date.now() - lastSeen.getTime()) / 60000);
  if (mins < 10) return ru.online.now;
  if (mins < 60) return ru.online.minsAgo(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return ru.online.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days < 30) return ru.online.daysAgo(days);
  return ru.online.longAgo;
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
  const [likes, myLikes, following, followers, rankAbove, moreInCity] = await Promise.all([
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
    // «Ещё в этом городе» — кросс-линки для находимости (работает на текущих данных)
    db.photographerProfile.findMany({
      where: { status: 'APPROVED', cityId: profile.cityId, id: { not: profile.id } },
      orderBy: { ratingScore: 'desc' },
      take: 6,
      select: {
        username: true,
        user: { select: { firstName: true, lastName: true } },
        photos: { where: { status: 'APPROVED' }, orderBy: { publishedAt: 'desc' }, take: 1, select: { storageKey: true } },
      },
    }),
  ]);
  const likeCount = new Map(likes.map((l) => [l.photoId, l._count]));
  const likedSet = new Set(myLikes.map((l) => l.photoId));
  const isSelf = session?.userId === profile.userId;
  const cityRank = rankAbove + 1;
  const lastSeen = profile.user.lastSeenAt;
  const onlineText = relativeOnline(lastSeen);

  const reviews = await reviewsForProfile(profile.id);
  const alreadyReviewed = session
    ? Boolean(
        await db.review.findUnique({
          where: { authorUserId_profileId: { authorUserId: session.userId, profileId: profile.id } },
          select: { id: true },
        }),
      )
    : false;

  const initials = `${profile.user.firstName.slice(0, 1)}${profile.user.lastName.slice(0, 1)}`;

  const absUrl = (u: string) => (u.startsWith('http') ? u : `${BASE_URL}${u}`);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:py-10">
      <JsonLd
        data={personLd({
          firstName: profile.user.firstName,
          lastName: profile.user.lastName,
          username: profile.username,
          cityName: cityNameRu(profile.city.slug),
          categories: profile.categories.map((c) => categoryNameRu(c.category.slug)),
          imageUrls: profile.photos.slice(0, 5).map((p) => absUrl(webVariantUrl(p.storageKey))),
          bio: profile.bio,
        })}
      />
      <header className="border-b border-line pb-5 sm:pb-8">
        {/* Шапка профиля: аватар + имя + ряд статистики (app-подача как в Instagram) */}
        <div className="flex items-center gap-4 sm:gap-5">
          {profile.avatarKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl(profile.avatarKey)} alt="" width={80} height={80}
              className="h-[72px] w-[72px] shrink-0 rounded-full object-cover sm:h-20 sm:w-20" />
          ) : (
            <span className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full bg-surface-2 text-xl font-semibold sm:h-20 sm:w-20 sm:text-2xl">
              {initials}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-stretch justify-around gap-2 text-center">
              <span className="flex flex-col"><b className="text-lg font-semibold leading-tight">{cityRank}</b><span className="text-xs muted">{ru.profile.statCityRank}</span></span>
              <span className="flex flex-col"><b className="text-lg font-semibold leading-tight">{followers}</b><span className="text-xs muted">{ru.profile.statFollowers}</span></span>
              <span className="flex flex-col"><b className="text-lg font-semibold leading-tight">{profile.photos.length}</b><span className="text-xs muted">{ru.profile.statPhotos}</span></span>
            </div>
          </div>
        </div>

        <h1 className="mt-4 text-2xl font-semibold sm:text-4xl">
          {profile.user.firstName} {profile.user.lastName}
        </h1>
        <p className="mt-1 text-sm muted">
          {cityNameRu(profile.city.slug)} · {profile.categories.map((c) => categoryNameRu(c.category.slug)).join(' · ')}
        </p>
        {onlineText && <p className="mt-0.5 text-xs muted">{onlineText}</p>}
        {reviews.aggregate.count > 0 && (
          <p className="mt-1 text-sm">
            <span className="text-accent">★</span> <b className="font-semibold">{reviews.aggregate.avg.toFixed(1)}</b>{' '}
            <span className="muted">{ru.reviews.count(reviews.aggregate.count)}</span>
          </p>
        )}
        {profile.bio && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed">{profile.bio}</p>}
        {(profile.experienceYears != null || profile.languages.length > 0 || profile.equipment || profile.teamInfo) && (
          <dl className="mt-4 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            {profile.experienceYears != null && (
              <div className="flex gap-2"><dt className="muted">{ru.profile.experienceLabel}:</dt><dd>{ru.profile.experienceYears(profile.experienceYears)}</dd></div>
            )}
            {profile.languages.length > 0 && (
              <div className="flex gap-2"><dt className="muted">{ru.profile.languagesLabel}:</dt><dd>{profile.languages.map((l) => ru.profile.langName[l] ?? l).join(', ')}</dd></div>
            )}
            {profile.equipment && (
              <div className="flex gap-2"><dt className="muted">{ru.profile.equipmentLabel}:</dt><dd>{profile.equipment}</dd></div>
            )}
            {profile.teamInfo && (
              <div className="flex gap-2"><dt className="muted">{ru.profile.teamLabel}:</dt><dd>{profile.teamInfo}</dd></div>
            )}
          </dl>
        )}
        {!isSelf && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <MessageButton userId={profile.userId} />
            <FollowButton userId={profile.userId} initialFollowing={Boolean(following)} authed={Boolean(session)} />
            <FavoriteButton userId={profile.userId} initialFavorited={favorited} authed={Boolean(session)} />
          </div>
        )}
        {(profile.whatsapp || profile.telegram || profile.siteUrl) && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {profile.whatsapp && (
              <a href={`https://wa.me/${profile.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer"
                className="rounded-full border border-line px-3 py-1.5 transition hover:bg-surface-2">WhatsApp</a>
            )}
            {profile.telegram && (
              <a href={`https://t.me/${profile.telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer"
                className="rounded-full border border-line px-3 py-1.5 transition hover:bg-surface-2">Telegram</a>
            )}
            {profile.siteUrl && /^https?:\/\//i.test(profile.siteUrl) && (
              <a href={profile.siteUrl} target="_blank" rel="noreferrer"
                className="rounded-full border border-line px-3 py-1.5 transition hover:bg-surface-2">{ru.profile.site}</a>
            )}
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

      <section className="mt-8 sm:mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-widest muted">{ru.profile.portfolioTitle}</h2>
        {/* Мобайл: edge-to-edge masonry (app-подача); десктоп: 3 колонки. Client-
            галерея принимает только сериализуемые данные (RSC-совместимо). */}
        <PortfolioGallery
          items={profile.photos.map((p) => ({
            id: p.id,
            src: webVariantUrl(p.storageKey),
            width: p.width,
            height: p.height,
            blurhash: p.blurhash,
            editorsChoice: Boolean(p.editorsChoiceAt),
            liked: likedSet.has(p.id),
            likeCount: likeCount.get(p.id) ?? 0,
          }))}
          authed={Boolean(session)}
          editorsChoiceLabel={ru.profile.editorsChoice}
        />
      </section>

      <ReviewSection
        profileId={profile.id}
        aggregate={reviews.aggregate}
        initial={reviews.items.map((r) => ({
          id: r.id,
          rating: r.rating,
          body: r.body,
          verified: r.verified,
          authorName: r.authorName,
          createdAt: r.createdAt.toISOString(),
          reply: r.reply,
        }))}
        me={{
          userId: session?.userId ?? null,
          authed: Boolean(session),
          isClient: session?.role === 'CLIENT',
          isOwner: isSelf,
          isAdmin: session?.role === 'ADMIN',
          alreadyReviewed,
        }}
      />

      {moreInCity.length > 0 && (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest muted">
            {ru.profile.moreInCity(cityNameRu(profile.city.slug))}
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            {moreInCity.map((m) => (
              <li key={m.username}>
                <Link href={`/ru/photographer/${m.username}`} className="group block">
                  <div className="aspect-square overflow-hidden rounded-lg bg-surface-2">
                    {m.photos[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbVariantUrl(m.photos[0].storageKey)} alt="" loading="lazy"
                        className="h-full w-full object-cover transition group-hover:brightness-95" />
                    )}
                  </div>
                  <span className="mt-1 block truncate text-sm">{m.user.firstName} {m.user.lastName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
