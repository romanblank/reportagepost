import Link from "next/link";
import { CatalogCards } from "@/components/CatalogCards";
import { ru } from "@/i18n/ru";
import { cityNameRu } from "@/lib/geo-data";
import { webVariantUrl } from "@/lib/photos";
import { storage } from "@/lib/storage";
import { cachedHomeData } from "@/lib/home-data";
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
  const { week, fresh, photographers, photos, cityAuthors, heroReel } = await cachedHomeData();

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
        // Пометка «Пример» есть в каталоге и на странице автора — герой
        // главной не имеет права быть единственным местом, где демо выглядит
        // настоящим (аудит 2026-08-16)
        isDemo: heroFeatured.isDemo,
      }
    : null;

  // «Шоурил недели»: публичные URL вариантов строим на сервере — клиентскому
  // плееру уходят только готовые ссылки раздатчика
  const reel = heroReel
    ? {
        hdSrc: heroReel.hdKey ? storage.publicUrl(heroReel.hdKey) : null,
        sdSrc: heroReel.sdKey ? storage.publicUrl(heroReel.sdKey) : null,
        poster: heroReel.posterKey ? storage.publicUrl(heroReel.posterKey) : null,
        name: `${heroReel.profile.user.firstName} ${heroReel.profile.user.lastName}`.trim(),
        href: `/ru/photographer/${heroReel.profile.username}`,
        isDemo: heroReel.profile.isDemo,
      }
    : null;

  return (
    <main className="flex-1">
      <LandingHero photographers={photographers} photos={photos}
        backdropSrc={heroFeatured ? webVariantUrl(heroFeatured.storageKey) : null}
        featured={featured} reel={reel} />

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
            <Link href="/ru/russia/moscow" className="t-small text-accent hover:underline">
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
              <span className="tnum t-small" style={{ fontFamily: 'var(--font-mono)', color: 'var(--recognition)' }}>{p.n}</span>
              <h3 className="t-h3 mt-2">{p.t}</h3>
              <p className="mt-2 t-small leading-relaxed muted">{p.d}</p>
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
            <Link href="/ru/photo" className="t-small text-accent hover:underline">{ru.landing.feedMore}</Link>
          </div>
          <div className="mt-5"><FeedMasonry capped photos={feedPhotos} /></div>
        </section>
      )}

      {/* «Недавно присоединившиеся» с главной убраны (партнёр 2026-08-18):
          их место — журнал, а главная — лаконичный вход, не дубль разделов */}
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
              <div key={p.t} className="rounded-media border border-line bg-surface-2 p-5">
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
