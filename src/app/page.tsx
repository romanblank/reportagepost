import Link from "next/link";
import { CatalogCards } from "@/components/CatalogCards";
import { ru } from "@/i18n/ru";
import { cityNameRu } from "@/lib/geo-data";
import { webVariantUrl } from "@/lib/photos";
import { cachedHomeData } from "@/lib/home-data";
import { Avatar } from "@/components/ui/Avatar";
import { LandingHero } from "@/components/LandingHero";
import { FeedMasonry } from "@/components/FeedGallery";

// force-dynamic: главная тянет ленты из БД (урок: static-страница с запросом
// падает на пререндере в Docker-билде без DATABASE_URL).
export const dynamic = "force-dynamic";

// Discovery-главная (модель MyWed, v9): герой-поиск+«кадр недели» → жанры →
// что набирает отклик → свежее → репортажи → сообщество. Всё алгоритмически
// (по отклику/свежести), без «выбора редакции» — меньше ручной модерации.
// Пустые ленты честно скрываются.
export default async function Home() {
  // Витрина кешируется на 2 минуты (аудит P1): раньше каждый заход заново
  // агрегировал лайки за неделю и все ленты. Персонализации на главной нет,
  // поэтому кеш общий и безопасный.
  const { week, fresh, newAuthors, photographers, photos, cityAuthors } = await cachedHomeData();

  // Прототип показывает одну ленту отклика; берём лучшее за неделю, а на малых
  // данных честно подставляем свежее — пустая секция хуже, чем свежая.
  const feedPhotos = week.length > 0 ? week : fresh;


  // Featured «Кадр недели» — алгоритмически: топ по отклику за неделю (не выбор
  // редакции). Фон героя — тот же кадр приглушённо.
  const heroFeatured = week[0] ?? fresh[0];
  const featured = heroFeatured
    ? {
        src: webVariantUrl(heroFeatured.storageKey),
        name: `${heroFeatured.firstName} ${heroFeatured.lastName}`.trim(),
        href: `/ru/photographer/${heroFeatured.username}`,
      }
    : null;

  return (
    <main className="flex-1">
      <LandingHero photographers={photographers} photos={photos}
        backdropSrc={heroFeatured ? webVariantUrl(heroFeatured.storageKey) : null}
        featured={featured} />

      {/* Авторы города (прототип v9): главная показывала кадры, но не людей —
          при том что выбирают именно автора. Карточка та же, что в каталоге. */}
      {cityAuthors.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 pt-12 sm:pt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="t-caption muted" style={{ fontFamily: 'var(--font-mono)' }}>
                {ru.landing.cityAuthorsKicker}
              </p>
              <h2 className="t-h2 mt-1">{ru.landing.cityAuthorsTitle(cityNameRu('moscow'))}</h2>
            </div>
            <Link href="/ru/russia/moscow" className="text-sm text-accent hover:underline">
              {ru.landing.cityAuthorsMore}
            </Link>
          </div>
          <CatalogCards cards={cityAuthors} cityName={cityNameRu('moscow')} />
        </section>
      )}

      {/* Как устроено доверие — то, чем платформа отличается от биржи.
          В прототипе это отдельный разговор с заказчиком, и не зря: механику
          «подтверждённых съёмок» нигде больше не объясняли. */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-14 sm:pt-16">
        <p className="t-caption muted" style={{ fontFamily: 'var(--font-mono)' }}>
          {ru.landing.trustSectionKicker}
        </p>
        <h2 className="t-h2 mt-1 max-w-[24ch]">{ru.landing.trustSectionTitle}</h2>
        {/* Нумерация здесь не украшение: это последовательность, по которой
            выстроено доверие — сначала порядок выдачи, потом отзыв, потом сделка */}
        <ul className="mt-7 grid gap-6 sm:grid-cols-3 sm:gap-8">
          {[
            { n: '01', t: ru.landing.trustPoint1Title, d: ru.landing.trustPoint1Text },
            { n: '02', t: ru.landing.trustPoint2Title, d: ru.landing.trustPoint2Text },
            { n: '03', t: ru.landing.trustPoint3Title, d: ru.landing.trustPoint3Text },
          ].map((p) => (
            <li key={p.t} className="border-t border-line pt-4">
              <span className="tnum text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--recognition)' }}>{p.n}</span>
              <h3 className="mt-2 text-[17px]" style={{ fontFamily: 'var(--font-display)' }}>{p.t}</h3>
              <p className="mt-2 text-sm leading-relaxed muted">{p.d}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Одна лента вместо трёх (прототип): «что набирает отклик». Раньше шли
          подряд «лучшее за неделю», «свежее» и «серии» — три почти одинаковые
          мозаики, между которыми человек не видел разницы. */}
      {feedPhotos.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 pb-12 pt-14 sm:pb-14 sm:pt-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="t-caption muted" style={{ fontFamily: 'var(--font-mono)' }}>{ru.landing.feedKicker}</p>
              <h2 className="t-h2 mt-1">{ru.landing.feedTitle}</h2>
            </div>
            <Link href="/ru/photo" className="text-sm text-accent hover:underline">{ru.landing.feedMore}</Link>
          </div>
          <div className="mt-5"><FeedMasonry photos={feedPhotos} /></div>
        </section>
      )}

      {/* Новые авторы — автоматически по дате прихода (без курирования) */}
      {newAuthors.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:pb-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="t-caption muted" style={{ fontFamily: 'var(--font-mono)' }}>{ru.landing.newAuthorsKicker}</p>
              <h2 className="t-h2 mt-1">{ru.landing.newAuthorsTitle(cityNameRu('moscow'))}</h2>
            </div>
            <Link href="/ru/community" className="text-sm text-accent hover:underline">{ru.landing.newAuthorsMore}</Link>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-4">
            {newAuthors.map((a) => (
              <li key={a.username} className="group">
                <Link href={`/ru/photographer/${a.username}`} className="block">
                  <div className="relative overflow-hidden rounded-media bg-surface-2">
                    {a.photos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={webVariantUrl(a.photos[0].storageKey)}
                        alt={`${a.user.firstName} ${a.user.lastName}`} loading="lazy"
                        className="aspect-[3/4] w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                    ) : (
                      <div className="grid aspect-[3/4] w-full place-items-center">
                        <Avatar avatarKey={a.avatarKey} firstName={a.user.firstName} lastName={a.user.lastName} size={64} />
                      </div>
                    )}
                    <span className="absolute left-2.5 top-2.5 rounded-full border border-line bg-surface/70 px-2.5 py-1 text-[11px] backdrop-blur-sm"
                      style={{ color: "var(--verified)" }}>
                      {ru.landing.newAuthorBadge}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="t-small truncate font-medium">{a.user.firstName} {a.user.lastName}</div>
                    {a.city && <div className="t-caption mt-0.5 truncate muted">{cityNameRu(a.city.slug)}</div>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Для фотографов — ценность подписки Active/Active+ (антиклассизм-инвариант) */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-16 lg:grid-cols-2">
          <div>
            <p className="t-caption text-accent" style={{ fontFamily: 'var(--font-mono)' }}>{ru.landing.photographerBandEyebrow}</p>
            <h2 className="t-h2 mt-3 max-w-[20ch]">{ru.landing.photographerBandTitle}</h2>
            <p className="t-body mt-4 max-w-prose muted">{ru.landing.photographerBandText}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/ru/register" className="btn btn-accent btn-lg">{ru.landing.photographerBandJoin}</Link>
              <Link href="/ru/pro" className="btn btn-outline btn-lg">{ru.landing.photographerBandPricing}</Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { t: ru.landing.perkPageTitle, d: ru.landing.perkPageText },
              { t: ru.landing.perkAnalyticsTitle, d: ru.landing.perkAnalyticsText },
              { t: ru.landing.perkShelfTitle, d: ru.landing.perkShelfText },
              { t: ru.landing.perkInquiriesTitle, d: ru.landing.perkInquiriesText },
            ].map((p) => (
              <div key={p.t} className="rounded-lg border border-line bg-surface-2 p-5">
                <div className="font-medium">{p.t}</div>
                <p className="t-small mt-1.5 muted">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </main>
  );
}
