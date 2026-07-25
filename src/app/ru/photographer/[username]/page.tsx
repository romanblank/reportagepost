import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { webVariantUrl, thumbVariantUrl } from '@/lib/photos';
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
import { VerifyButton } from '@/components/VerifyButton';
import { parseFaq } from '@/lib/faq';
import { tierOf } from '@/lib/subscription';
import { ProfileViewBeacon } from '@/components/ProfileViewBeacon';
import { shootStats, hasShotWith } from '@/lib/shoots';
import { ConfirmShootButton } from '@/components/ConfirmShootButton';
import { ProfileHero } from '@/components/ProfileHero';

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
      photos: { where: { status: 'APPROVED' }, orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }], take: 60 },
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
  // Все независимые запросы — одним Promise.all (ревью №7: было 4 сериализованных
  // round-trip'а на каждый force-dynamic заход).
  const [favoritedRow, likes, myLikes, following, followers, moreInCity, reviews, alreadyReviewedRow, followingCount, photographerTier, shoots, iShotWith] = await Promise.all([
    session
      ? db.favoritePhotographer.findUnique({
          where: { userId_profileId: { userId: session.userId, profileId: profile.id } },
        })
      : Promise.resolve(null),
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
    reviewsForProfile(profile.id),
    session
      ? db.review.findUnique({
          where: { authorUserId_profileId: { authorUserId: session.userId, profileId: profile.id } },
          select: { id: true },
        })
      : Promise.resolve(null),
    // подписки фотографа (парити MyWed: счётчик «подписки»)
    db.follow.count({ where: { followerId: profile.userId } }),
    tierOf(profile.userId), // бейдж уровня (Prime/Elite) в шапке
    shootStats(profile.id), // факты «снимали вместе» (доброжелательная система)
    session ? hasShotWith(session.userId, profile.id) : Promise.resolve(false),
  ]);
  const favorited = Boolean(favoritedRow);
  const alreadyReviewed = Boolean(alreadyReviewedRow);
  const likeCount = new Map(likes.map((l) => [l.photoId, l._count]));
  const likedSet = new Set(myLikes.map((l) => l.photoId));
  const isSelf = session?.userId === profile.userId;
  const lastSeen = profile.user.lastSeenAt;
  const onlineText = relativeOnline(lastSeen);
  const faq = parseFaq(profile.faq);


  const absUrl = (u: string) => (u.startsWith('http') ? u : `${BASE_URL}${u}`);

  // Обложка героя = кадр «выбор редакции» или первый в портфолио
  const coverPhoto = profile.photos.find((p) => p.editorsChoiceAt) ?? profile.photos[0];
  const minPkg = profile.packages[0];
  const heroFacts: string[] = [];
  if (shoots.count > 0) heroFacts.push(`${shoots.count} ${ru.profile.shootsLabel}`);
  if (shoots.returning > 0) heroFacts.push(`${shoots.returning} ${ru.profile.returningLabel}`);

  return (
    <main className="flex-1">
      {!isSelf && <ProfileViewBeacon profileId={profile.id} />}
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

      <ProfileHero
        coverSrc={coverPhoto ? webVariantUrl(coverPhoto.storageKey) : null}
        avatarKey={profile.avatarKey}
        firstName={profile.user.firstName}
        lastName={profile.user.lastName}
        username={profile.username}
        cityName={cityNameRu(profile.city.slug)}
        categories={profile.categories.map((c) => categoryNameRu(c.category.slug))}
        verified={profile.verified}
        verifiedHint={ru.profile.verifiedHint}
        tier={photographerTier}
        tierLabel={photographerTier !== 'FREE' ? ru.pro.tierName[photographerTier] : ''}
        photosCount={profile.photos.length}
        photosLabel={ru.profile.statPhotos}
        facts={heroFacts}
        onlineText={onlineText}
      />

      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-7">
        {/* Панель действий — сразу под героем (конверсия впереди) */}
        {!isSelf && (
          <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Link href={`/ru/inquiry?photographer=${profile.username}`}
                className="btn btn-accent col-span-2 py-2.5 sm:col-span-1 sm:px-7">{ru.profile.sendInquiry}</Link>
              <MessageButton userId={profile.userId} />
              <FollowButton userId={profile.userId} initialFollowing={Boolean(following)} authed={Boolean(session)} />
              <FavoriteButton userId={profile.userId} initialFavorited={favorited} authed={Boolean(session)} />
              {(!session || session.role === 'CLIENT') && (
                <ConfirmShootButton profileId={profile.id} initialConfirmed={iShotWith} authed={Boolean(session)} />
              )}
            </div>
            {minPkg && (
              <div className="flex shrink-0 items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0.5">
                <span className="t-caption muted">{ru.profile.packageHours(minPkg.hours)}</span>
                <span className="tnum text-xl font-semibold">{formatRubMinor(minPkg.priceMinor)}</span>
              </div>
            )}
          </div>
        )}
        {session?.role === 'ADMIN' && (
          <div className="mt-4"><VerifyButton profileId={profile.id} verified={profile.verified} /></div>
        )}

        {/* Соц-статы + контакты */}
        <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-3">
          <span className="flex items-baseline gap-1.5"><b className="tnum text-lg font-semibold">{followers}</b><span className="t-caption muted">{ru.profile.statFollowers}</span></span>
          <span className="flex items-baseline gap-1.5"><b className="tnum text-lg font-semibold">{followingCount}</b><span className="t-caption muted">{ru.profile.statFollowing}</span></span>
          {(profile.whatsapp || profile.telegram || profile.siteUrl) && (
            <div className="flex flex-wrap gap-2 text-sm sm:ml-auto">
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
        </div>

        {/* О фотографе */}
        {(profile.bio || profile.experienceYears != null || profile.languages.length > 0 || profile.equipment || profile.teamInfo) && (
          <section className="mt-6">
            {profile.bio && <p className="max-w-2xl text-[15px] leading-relaxed">{profile.bio}</p>}
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
          </section>
        )}

      {/* Полный прайс — только если пакетов больше одного (entry-цена уже в панели действий) */}
      {profile.packages.length > 1 && (
        <section className="mt-8">
          <h2 className="t-caption muted">{ru.profile.pricesTitle}</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profile.packages.map((pkg) => (
              <li key={pkg.id} className="card p-4">
                <div className="t-caption muted">{ru.profile.packageHours(pkg.hours)}</div>
                <div className="tnum mt-1 text-xl font-semibold">{formatRubMinor(pkg.priceMinor)}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.stories.length > 0 && (
        <section className="mt-10">
          <h2 className="t-caption muted">{ru.profile.storiesTitle}</h2>
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
        <h2 className="t-caption muted">{ru.profile.portfolioTitle}</h2>
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

      {faq.length > 0 && (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="text-lg font-medium">{ru.profile.faqTitle}</h2>
          <dl className="mt-4 flex flex-col gap-4">
            {faq.map((item, i) => (
              <div key={i}>
                <dt className="font-medium">{item.q}</dt>
                <dd className="mt-1 text-sm leading-relaxed muted">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <ReviewSection
        profileId={profile.id}
        aggregate={reviews.aggregate}
        initial={reviews.items.map((r) => ({
          id: r.id,
          rating: r.rating,
          body: r.body,
          verified: r.verified,
          authorUserId: r.authorUserId,
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
          <h2 className="t-caption muted">
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
      </div>
    </main>
  );
}
