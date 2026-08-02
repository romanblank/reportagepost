import { cache } from 'react';
import { monthLabelRu } from '@/lib/date-format';
import { ProfileSubnav } from '@/components/ProfileSubnav';
import { ProfileBooking } from '@/components/ProfileBooking';
import { ProfileStats, ProfileGear, ConfirmedShoots } from '@/components/ProfileStats';
import { VideoPlayer } from '@/components/VideoPlayer';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { APP_NAME } from '@/lib/constants';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { db } from '@/lib/db';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { webVariantUrl, thumbVariantUrl } from '@/lib/photos';
import Link from 'next/link';
import { formatRubMinor } from '@/lib/money';
import { ru, label } from '@/i18n/ru';
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
import { parseShowreels } from '@/lib/showreel';
import { storage } from '@/lib/storage';
import { tierOf } from '@/lib/subscription';
import { ProfileViewBeacon } from '@/components/ProfileViewBeacon';
import { shootStats, hasShotWith } from '@/lib/shoots';
import { ConfirmShootButton } from '@/components/ConfirmShootButton';
import { ProfileHero } from '@/components/ProfileHero';
import { coverShowreelAllowed } from '@/lib/pricing';
import { ShareButton } from '@/components/ShareButton';
import { ReportButton } from '@/components/ReportButton';

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

// Запрос дедуплицируется в пределах одного рендера (аудит 2026-08-01, P2).
// generateMetadata и сам компонент вызывают его независимо, а Prisma-вызовы
// Next не дедуплицирует (в отличие от fetch) — самая посещаемая страница
// платформы делала тяжёлый джойн ДВАЖДЫ на каждый заход. cache() из react
// уже применён так же к getSession (src/lib/auth.ts).
const findProfile = cache(async (username: string) => {
  return db.photographerProfile.findFirst({
    where: { username, status: 'APPROVED' },
    include: {
      user: true,
      city: true,
      categories: { include: { category: true } },
      packages: { orderBy: { sortOrder: 'asc' } },
      photos: { where: { status: 'APPROVED' }, orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }], take: 60 },
      // Только готовые: у необработанного ролика ещё нет web-вариантов, а
      // исходник наружу не отдаётся — играть было бы нечего
      videos: { where: { status: 'APPROVED', processing: 'READY' }, orderBy: { sortOrder: 'asc' } },
      stories: {
        where: { status: 'APPROVED' },
        orderBy: { publishedAt: 'desc' },
        include: { photos: { where: { status: 'APPROVED' }, take: 1 } },
      },
    },
  });
});

/**
 * Прежний адрес профиля → актуальный (аудит 2026-08-01, P2).
 *
 * Смена username меняла URL молча, и все существующие ссылки — из мессенджеров,
 * соцсетей, визиток, поисковой выдачи — начинали вести в 404. Здесь старый
 * адрес отдаёт постоянный редирект: ссылки продолжают работать, а вес адреса
 * переносится на новый.
 */
const renamedTo = cache(async (username: string): Promise<string | null> => {
  const row = await db.usernameHistory.findUnique({
    where: { username },
    select: { profile: { select: { username: true, status: true } } },
  });
  return row?.profile.status === 'APPROVED' ? row.profile.username : null;
});

export async function generateMetadata(props: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await props.params;
  const profile = await findProfile(username);
  if (!profile) {
    const actual = await renamedTo(username);
    // Канонический адрес — новый: поисковики переносят вес на него
    if (actual) return { alternates: { canonical: `${BASE_URL}/ru/photographer/${actual}` } };
    return { title: ru.profile.notFound };
  }
  const title = `${profile.user.firstName} ${profile.user.lastName} — ${ru.catalog.title(cityNameRu(profile.city.slug))}`;
  const description = profile.bio ?? title;
  // Страница-как-сайт: при шеринге ссылки — превью с лучшим кадром автора
  const cover = profile.photos.find((p) => p.editorsChoiceAt) ?? profile.photos[0];
  // S3 даёт полный https-URL, LocalDisk — /files/…; префикс BASE_URL только для относительных
  const rawCover = cover ? webVariantUrl(cover.storageKey) : undefined;
  const ogImage = rawCover ? (rawCover.startsWith('http') ? rawCover : `${BASE_URL}${rawCover}`) : undefined;
  const url = `${BASE_URL}/ru/photographer/${profile.username}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile', url, title, description, siteName: APP_NAME,
      images: ogImage ? [{ url: ogImage, width: cover!.width, height: cover!.height }] : undefined,
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title, description, images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function ProfilePage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;
  const profile = await findProfile(username);
  if (!profile) {
    // Адрес мог смениться — уводим на актуальный, а не в 404
    const actual = await renamedTo(username);
    if (actual) permanentRedirect(`/ru/photographer/${actual}`);
    notFound();
  }

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
      where: {
        status: 'APPROVED', cityId: profile.cityId, id: { not: profile.id },
        // Та же планка, что в каталоге: автор без опубликованной работы
        // показывался пустой серой плиткой — реклама пустоты вместо коллеги.
        photos: { some: { status: 'APPROVED' } },
      },
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

  // Шоурилы — безопасные embed'ы известных провайдеров (whitelist).
  const showreels = parseShowreels(profile.showreelUrls);
  // Обложка героя = кадр «выбор редакции» или первый в портфолио
  const coverPhoto = profile.photos.find((p) => p.editorsChoiceAt) ?? profile.photos[0];
  const minPkg = profile.packages[0];
  const heroFacts: string[] = [];
  if (shoots.count > 0) heroFacts.push(`${shoots.count} ${ru.profile.shootsLabel}`);
  if (shoots.returning > 0) heroFacts.push(`${shoots.returning} ${ru.profile.returningLabel}`);
  // Расширенная страница (пакеты цен, оборудование, команда, FAQ) — перк Active/Active+.
  // На FREE публично не показываем (заказчик пишет напрямую, цену уточняет в диалоге).
  const isPaid = photographerTier !== 'FREE';

  // Техника — карточками (прототип v9). Парк оборудования для событийной
  // съёмки professional-аргумент: второй корпус, светосильная оптика, свет.
  // Занятость на текущий месяц — для панели обращения. Данные вёл сам автор в
  // кабинете, но заказчик их не видел, хотя это его первый вопрос при дате.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const busyRows = await db.busyDate.findMany({
    where: { profileId: profile.id, date: { gte: monthStart, lt: monthEnd } },
    select: { date: true },
  });
  const busyDays = busyRows.map((b) => b.date.getUTCDate());
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  // В России неделя начинается с понедельника, getUTCDay() — с воскресенья
  const firstWeekday = (monthStart.getUTCDay() + 6) % 7;

  const gearGroups = [
    { title: ru.profile.gearCameras, items: profile.cameras.map((name) => ({ name })) },
    { title: ru.profile.gearLenses, items: profile.lenses.map((name) => ({ name })) },
    { title: ru.profile.gearLighting, items: profile.lighting.map((name) => ({ name })) },
    { title: ru.profile.gearTeam, items: profile.teamInfo ? [{ name: profile.teamInfo }] : [] },
  ];

  // Живая обложка — перк Active+: первый готовый ролик автора играет вместо
  // статичного кадра. Ниже уровня перк не выдаётся даже при наличии роликов.
  const coverShowreel = coverShowreelAllowed(photographerTier)
    ? profile.videos.find((v) => v.sdKey)?.sdKey ?? null
    : null;

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
        showreelSrc={coverShowreel ? storage.publicUrl(coverShowreel) : null}
        avatarKey={profile.avatarKey}
        firstName={profile.user.firstName}
        lastName={profile.user.lastName}
        role={profile.doesVideo ? ru.profile.roleBoth : ru.profile.rolePhotographer}
        cityName={cityNameRu(profile.city.slug)}
        categories={profile.categories.map((c) => categoryNameRu(c.category.slug))}
        verified={profile.verified}
        verifiedHint={ru.profile.verifiedHint}
        verifiedLabel={ru.profile.verifiedShort}
        tier={photographerTier}
        tierLabel={photographerTier !== 'FREE' ? label(ru.pro.tierName, photographerTier) : ''}
        sinceText={profile.experienceYears != null
          ? ru.profile.sinceYear(new Date().getFullYear() - profile.experienceYears)
          : null}
        replyText={onlineText}
      />

      <ProfileSubnav
        items={[
          { id: 'overview', label: ru.profile.navOverview },
          { id: 'works', label: ru.profile.navWorks },
          ...(profile.videos.length > 0 ? [{ id: 'video', label: ru.profile.navVideo }] : []),
          ...(gearGroups.some((g) => g.items.length > 0) ? [{ id: 'gear', label: ru.profile.navGear }] : []),
          { id: 'reviews', label: ru.profile.navReviews },
          ...(isSelf ? [] : [{ id: 'booking', label: ru.profile.navCalendar }]),
        ]}
        summary={shoots.count > 0
          ? `${ru.profile.shootsCount(shoots.count)} · ${ru.profile.shootsReturning(shoots.returning)}`
          : null}
      />

      {/* Разворот: контент слева, обращение к автору — липкой колонкой справа
          (прототип v9). Раньше цены, контакты и занятость были размазаны по
          странице, и заказчик собирал их скроллом. */}
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_340px] lg:gap-12">
        <div className="order-2 min-w-0 lg:order-1">
        {!isSelf && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line pb-6">
            <MessageButton userId={profile.userId} />
            <FollowButton userId={profile.userId} initialFollowing={Boolean(following)} authed={Boolean(session)} />
            <FavoriteButton userId={profile.userId} initialFavorited={favorited} authed={Boolean(session)} />
            {(!session || session.role === 'CLIENT') && (
              <ConfirmShootButton profileId={profile.id} initialConfirmed={iShotWith} authed={Boolean(session)} />
            )}
          </div>
        )}
        {session?.role === 'ADMIN' && (
          <div className="mt-4"><VerifyButton profileId={profile.id} verified={profile.verified} /></div>
        )}

        {/* Соц-статы + контакты */}
        <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-3">
          {/* Счётчики кликабельны — follow-списки (паритет MyWed) */}
          <Link href={`/ru/photographer/${profile.username}/followers`}
            className="flex items-baseline gap-1.5 transition hover:opacity-80">
            <b className="tnum text-[15px] font-medium">{followers}</b><span className="t-caption muted">{ru.profile.statFollowers}</span>
          </Link>
          <Link href={`/ru/photographer/${profile.username}/following`}
            className="flex items-baseline gap-1.5 transition hover:opacity-80">
            <b className="tnum text-[15px] font-medium">{followingCount}</b><span className="t-caption muted">{ru.profile.statFollowing}</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-sm sm:ml-auto">
            <ShareButton path={`/ru/photographer/${profile.username}`} title={`${profile.user.firstName} ${profile.user.lastName}`} />

            {(profile.whatsapp || profile.telegram || profile.siteUrl) && (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* Владельцу-FREE — почему часть его страницы скрыта + апгрейд */}
        {isSelf && !isPaid && (
          <Link href="/ru/pro"
            className="mt-5 flex items-center justify-between gap-3 rounded-media border border-recognition/40 bg-recognition-soft/30 px-4 py-3 text-sm transition hover:border-recognition/70">
            <span className="muted">{ru.profile.freeOwnerHint}</span>
            <span className="shrink-0 font-medium text-recognition">{ru.profile.freeOwnerCta} →</span>
          </Link>
        )}

        {/* О фотографе. Оборудование/команда — расширенные поля (Active), гейтим. */}
        {(profile.bio || profile.experienceYears != null || profile.languages.length > 0 || (isPaid && (profile.equipment || profile.teamInfo))) && (
          <section id="overview" className="mt-10 scroll-mt-20">
            <SectionHeading kicker={ru.profile.aboutKicker} title={ru.profile.aboutTitle} />
            {/* Лид разворота: крупнее основного текста, в узкой колонке —
                строка длиной с журнальную, а не во всю ширину экрана */}
            {profile.bio && <p className="t-body-lg mt-4 max-w-[58ch] text-ink/90">{profile.bio}</p>}
            {(profile.experienceYears != null || profile.languages.length > 0 || (isPaid && (profile.equipment || profile.teamInfo))) && (
              <dl className="mt-4 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                {profile.experienceYears != null && (
                  <div className="flex gap-2"><dt className="muted">{ru.profile.experienceLabel}:</dt><dd>{ru.profile.experienceYears(profile.experienceYears)}</dd></div>
                )}
                {profile.languages.length > 0 && (
                  <div className="flex gap-2"><dt className="muted">{ru.profile.languagesLabel}:</dt><dd>{profile.languages.map((l) => ru.profile.langName[l] ?? l).join(', ')}</dd></div>
                )}
                {profile.doesVideo && (
                  <div className="flex gap-2"><dt className="muted">{ru.profile.formatsLabel}:</dt><dd>{ru.profile.formatsPhotoVideo}</dd></div>
                )}
                {isPaid && profile.cameras.length > 0 && (
                  <div className="flex gap-2"><dt className="muted">{ru.profile.camerasLabel}:</dt><dd>{profile.cameras.join(', ')}</dd></div>
                )}
                {isPaid && profile.lenses.length > 0 && (
                  <div className="flex gap-2"><dt className="muted">{ru.profile.lensesLabel}:</dt><dd>{profile.lenses.join(', ')}</dd></div>
                )}
                {isPaid && profile.lighting.length > 0 && (
                  <div className="flex gap-2"><dt className="muted">{ru.profile.lightingLabel}:</dt><dd>{profile.lighting.join(', ')}</dd></div>
                )}
                {isPaid && profile.equipment && profile.cameras.length === 0 && profile.lenses.length === 0 && profile.lighting.length === 0 && (
                  <div className="flex gap-2"><dt className="muted">{ru.profile.equipmentLabel}:</dt><dd>{profile.equipment}</dd></div>
                )}
                {isPaid && profile.teamInfo && (
                  <div className="flex gap-2"><dt className="muted">{ru.profile.teamLabel}:</dt><dd>{profile.teamInfo}</dd></div>
                )}
              </dl>
            )}
          </section>
        )}

      {/* Факты доверия крупно (прототип v9): в доброжелательной системе они
          заменяют звёздный рейтинг — не оценка, а то, что реально произошло. */}
      {(shoots.count > 0 || profile.photos.length > 0 || profile.experienceYears != null) && (
        <section className="mt-12">
          <SectionHeading kicker={ru.profile.statsKicker} title={ru.profile.statsTitle} />
          <div className="mt-5">
            <ProfileStats
              items={[
                ...(shoots.count > 0
                  ? [{ value: String(shoots.count), label: ru.profile.statsShoots, accent: true }]
                  : []),
                ...(shoots.returning > 0
                  ? [{ value: String(shoots.returning), label: ru.profile.statsReturning }]
                  : []),
                ...(profile.photos.length > 0
                  ? [{ value: String(profile.photos.length), label: ru.profile.statsWorks }]
                  : []),
                ...(profile.experienceYears != null
                  ? [{ value: String(profile.experienceYears), unit: ru.profile.yearsUnit, label: ru.profile.statsYears }]
                  : []),
              ]}
            />
          </div>
        </section>
      )}

      {/* Подтверждённые съёмки — три факта крупно (прототип v9) */}
      {shoots.count > 0 && (
        <section className="mt-12">
          <SectionHeading kicker={ru.profile.shootsKicker} title={ru.profile.shootsTitle} />
          <div className="mt-5">
            <ConfirmedShoots
              count={shoots.count}
              returning={shoots.returning}
              verifiedShare={reviews.items.length > 0
                ? Math.round((reviews.items.filter((r) => r.verified).length / reviews.items.length) * 100)
                : null}
            />
          </div>
        </section>
      )}

      {/* Техника — карточками по группам (прототип v9) */}
      {isPaid && gearGroups.some((g) => g.items.length > 0) && (
        <section id="gear" className="mt-12 scroll-mt-20">
          <SectionHeading kicker={ru.profile.gearKicker} title={ru.profile.gearTitle} />
          <div className="mt-5">
            <ProfileGear groups={gearGroups} />
          </div>
        </section>
      )}

      {/* Полный прайс — перк Active (пакеты цен). На FREE публично скрыт. */}
      {isPaid && profile.packages.length > 1 && (
        <section className="mt-8">
          <SectionHeading kicker={ru.profile.pricesKicker} title={ru.profile.pricesTitle} />
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
          <SectionHeading kicker={ru.profile.storiesKicker} title={ru.profile.storiesTitle} />
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

      {(showreels.length > 0 || profile.videos.length > 0) && (
        <section className="mt-10">
          <span id="video" className="block scroll-mt-20" />
          <SectionHeading kicker={ru.profile.videoKicker} title={ru.profile.videoTitle} />
          {/* Раскладка прототипа: первый ролик крупно, остальные — колонкой
              рядом. Шоурил у событийного автора продающий, и ставить его в
              общую сетку наравне с прочим — терять главное. */}
          <div className="mt-4 grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
            <div className="flex flex-col gap-3.5">
              {profile.videos.slice(0, 1).map((v) => (
                <figure key={v.id} className="relative overflow-hidden rounded-media border border-line bg-black">
                  <VideoPlayer
                    hdSrc={v.hdKey ? storage.publicUrl(v.hdKey) : null}
                    sdSrc={v.sdKey ? storage.publicUrl(v.sdKey) : null}
                    poster={v.posterKey ? storage.publicUrl(v.posterKey) : null}
                    title={v.title}
                    className="aspect-video w-full" />
                  {v.title && (
                    <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8 text-[13px] text-white">
                      {v.title}
                    </figcaption>
                  )}
                </figure>
              ))}
              {showreels.slice(0, 1).map((s) => (
                <div key={s.embedUrl} className="relative overflow-hidden rounded-media border border-line bg-black" style={{ aspectRatio: '16 / 9' }}>
                  <iframe src={s.embedUrl} title={ru.profile.videoTitle} loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen className="absolute inset-0 h-full w-full" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3.5">
              {profile.videos.slice(1).map((v) => (
                <figure key={v.id} className="relative overflow-hidden rounded-media border border-line bg-black">
                  <VideoPlayer
                    hdSrc={v.hdKey ? storage.publicUrl(v.hdKey) : null}
                    sdSrc={v.sdKey ? storage.publicUrl(v.sdKey) : null}
                    poster={v.posterKey ? storage.publicUrl(v.posterKey) : null}
                    title={v.title}
                    className="aspect-video w-full" />
                  {v.title && (
                    <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-xs text-white">
                      {v.title}
                    </figcaption>
                  )}
                </figure>
              ))}
              {showreels.slice(1).map((s) => (
                <div key={s.embedUrl} className="relative overflow-hidden rounded-media border border-line bg-black" style={{ aspectRatio: '16 / 9' }}>
                  <iframe src={s.embedUrl} title={ru.profile.videoTitle} loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen className="absolute inset-0 h-full w-full" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mt-8 sm:mt-10">
        <span id="works" className="block scroll-mt-20" />
        <SectionHeading kicker={ru.profile.portfolioKicker} title={ru.profile.portfolioTitle} />
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

      {/* FAQ — перк Active. На FREE публично скрыт. */}
      {isPaid && faq.length > 0 && (
        <section className="mt-10 border-t border-line pt-6">
          <SectionHeading title={ru.profile.faqTitle} />
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
        <section className="mt-14 border-t border-line pt-8">
          {/* Метка раздела — моно, как рубрика в издании; сам заголовок ниже
              набран антиквой: раньше вся секция была одной мелкой подписью */}
          <p className="t-caption muted" style={{ fontFamily: 'var(--font-mono)' }}>
            {ru.profile.moreInCityKicker}
          </p>
          <h2 className="t-h2 mt-1">{ru.profile.moreInCity(cityNameRu(profile.city.slug))}</h2>
          <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
            {moreInCity.map((m) => (
              <li key={m.username}>
                <Link href={`/ru/photographer/${m.username}`} className="group block">
                  {/* Острые углы у медиа — кадр остаётся кадром, а не «плиткой» */}
                  <div className="aspect-[4/5] overflow-hidden bg-surface-2">
                    {m.photos[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbVariantUrl(m.photos[0].storageKey)} alt="" loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                    )}
                  </div>
                  <span className="mt-2 block truncate text-[15px]"
                    style={{ fontFamily: 'var(--font-display)' }}>
                    {m.user.firstName} {m.user.lastName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Жалоба — внизу и тихо: это редкое служебное действие, а не элемент
          знакомства с автором (раньше стояло сразу под шапкой профиля) */}
      {!isSelf && (
        <div className="mt-12 border-t border-line pt-5 text-sm opacity-60">
          <ReportButton targetType="USER" targetId={profile.userId} authed={Boolean(session)} />
        </div>
      )}
        </div>

        {/* Правая колонка: цена, обращение, параметры работы и занятость */}
        {!isSelf && (
          <div id="booking" className="order-1 scroll-mt-20 lg:order-2">
          <ProfileBooking
            profileId={profile.id}
            username={profile.username}
            fromPriceMinor={isPaid && minPkg ? minPkg.priceMinor : null}
            facts={[
              { label: ru.profile.factCity, value: cityNameRu(profile.city.slug) },
              ...(onlineText ? [{ label: ru.profile.factReply, value: onlineText }] : []),
              { label: ru.profile.factFormats, value: profile.doesVideo ? ru.profile.formatsBoth : ru.profile.formatsPhoto },
              ...(profile.verified ? [{ label: ru.profile.factIdentity, value: ru.profile.factIdentityOk }] : []),
            ]}
            busyDays={busyDays}
            monthLabel={monthLabelRu(now)}
            daysInMonth={daysInMonth}
            firstWeekday={firstWeekday}
            canShowPhone={Boolean(profile.showPhone && profile.user.phone)}
          />
          </div>
        )}
      </div>
    </main>
  );
}
