import Link from "next/link";
import { ru } from "@/i18n/ru";
import { bestOfWeek, freshPhotos } from "@/lib/feeds";
import { categoryPreviews, freshStories } from "@/lib/discovery";
import { communityStats, recentPhotographers } from "@/lib/widgets";
import { cityNameRu } from "@/lib/geo-data";
import { webVariantUrl } from "@/lib/photos";
import { Avatar } from "@/components/ui/Avatar";
import { db } from "@/lib/db";
import { LandingHero } from "@/components/LandingHero";
import { FeedMasonry, StoryCards } from "@/components/FeedGallery";

// force-dynamic: главная тянет ленты из БД (урок: static-страница с запросом
// падает на пререндере в Docker-билде без DATABASE_URL).
export const dynamic = "force-dynamic";

// Discovery-главная (модель MyWed, v9): герой-поиск+«кадр недели» → жанры →
// что набирает отклик → свежее → репортажи → сообщество. Всё алгоритмически
// (по отклику/свежести), без «выбора редакции» — меньше ручной модерации.
// Пустые ленты честно скрываются.
export default async function Home() {
  const [week, fresh, stories, cats, stats, newAuthors, photographers, photos] = await Promise.all([
    bestOfWeek(12),
    freshPhotos(16),
    freshStories(6),
    categoryPreviews(),
    communityStats(),
    recentPhotographers(4),
    db.photographerProfile.count({ where: { status: "APPROVED" } }),
    db.photo.count({ where: { status: "APPROVED" } }),
  ]);

  const statTiles = [
    { label: ru.dashboard.statPhotographers, value: stats.photographers },
    { label: ru.dashboard.statPhotos, value: stats.photos },
    { label: ru.dashboard.statCities, value: stats.cities },
    { label: ru.dashboard.statStories, value: stats.stories },
  ].filter((t) => t.value > 0);

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

      {/* Жанры репортажа — навигационные карточки (всегда, даже пустые: показывают охват) */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:py-14">
        <SectionHeader title={ru.landing.discoverCategories} />
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cats.map((c) => (
            <li key={c.slug}>
              <Link href={`/ru/russia/moscow/${c.slug}`}
                className="group relative block overflow-hidden rounded-media border border-line bg-surface-2 transition hover:border-line-2">
                {c.coverKey ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={webVariantUrl(c.coverKey)} alt={c.nameRu} loading="lazy"
                      className="aspect-[3/2] w-full bg-cover bg-center object-cover transition duration-500 group-hover:scale-[1.04]"
                      style={c.blurData ? { backgroundImage: `url(${c.blurData})` } : undefined} />
                    <span className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/10 to-transparent p-3">
                      <span className="font-medium leading-tight text-white">{c.nameRu}</span>
                      {c.photoCount > 0 && (
                        <span className="mt-0.5 text-xs text-white/75">{ru.landing.categoryWorks(c.photoCount)}</span>
                      )}
                    </span>
                  </>
                ) : (
                  // Пустой жанр (бета): без фейк-фото — деликатный халфтон-мотив
                  // бренда (угасающие кольца точек), чтобы тайл читался намеренным
                  <div className="relative flex aspect-[3/2] w-full flex-col justify-end overflow-hidden p-3">
                    <svg viewBox="0 0 120 120" aria-hidden
                      className="absolute -right-6 -top-6 h-28 w-28 text-ink opacity-[0.07] transition duration-500 group-hover:opacity-[0.12]">
                      <g fill="currentColor">
                        <circle cx="60" cy="60" r="5" />
                        {Array.from({ length: 6 }).map((_, i) => {
                          const a = (i * Math.PI) / 3;
                          return <circle key={`r1-${i}`} cx={60 + 18 * Math.cos(a)} cy={60 + 18 * Math.sin(a)} r="4" opacity="0.8" />;
                        })}
                        {Array.from({ length: 12 }).map((_, i) => {
                          const a = (i * Math.PI) / 6 + Math.PI / 12;
                          return <circle key={`r2-${i}`} cx={60 + 34 * Math.cos(a)} cy={60 + 34 * Math.sin(a)} r="3" opacity="0.55" />;
                        })}
                        {Array.from({ length: 18 }).map((_, i) => {
                          const a = (i * Math.PI) / 9;
                          return <circle key={`r3-${i}`} cx={60 + 50 * Math.cos(a)} cy={60 + 50 * Math.sin(a)} r="2.2" opacity="0.35" />;
                        })}
                      </g>
                    </svg>
                    <span className="font-medium leading-tight">{c.nameRu}</span>
                    <span className="mt-0.5 text-xs text-muted-2 transition group-hover:text-recognition">{ru.landing.categoryExplore}</span>
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {week.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:pb-14">
          <SectionHeader title={ru.landing.discoverWeek} href="/ru/photo?tab=week" />
          <div className="mt-4"><FeedMasonry photos={week} /></div>
        </section>
      )}

      {fresh.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:pb-14">
          <SectionHeader title={ru.landing.recentWork} href="/ru/photo?tab=fresh" />
          <div className="mt-4"><FeedMasonry photos={fresh} /></div>
        </section>
      )}

      {stories.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:pb-14">
          <SectionHeader title={ru.landing.discoverStories} />
          <div className="mt-4"><StoryCards stories={stories} /></div>
        </section>
      )}

      {/* Новые авторы — автоматически по дате прихода (без курирования) */}
      {newAuthors.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:pb-14">
          <SectionHeader title={ru.landing.newAuthorsTitle} href="/ru/community" />
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

      {statTiles.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 pb-14">
          <div className="flex flex-wrap gap-x-12 gap-y-4 border-y border-line py-6">
            {statTiles.map((t) => (
              <Link key={t.label} href="/ru/community" className="group">
                <div className="tnum text-3xl font-semibold leading-none sm:text-4xl">{t.value}</div>
                <div className="t-caption mt-2 muted transition group-hover:text-recognition">{t.label}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Для фотографов — ценность подписки Active/Active+ (антиклассизм-инвариант) */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-16 lg:grid-cols-2">
          <div>
            <p className="t-caption text-accent">{ru.landing.photographerBandEyebrow}</p>
            <h2 className="t-h2 mt-4 max-w-[16ch]">{ru.landing.photographerBandTitle}</h2>
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

      {/* Заказчикам — краткая ценность */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16">
        <div className="max-w-prose border-t border-line-2 pt-5">
          <h2 className="t-h3">{ru.landing.forClients}</h2>
          <p className="t-body mt-2.5 muted">{ru.landing.forClientsText}</p>
        </div>
      </section>

      {/* Как это работает — три шага (нумерация = реальная последовательность) */}
      <section className="mx-auto w-full max-w-4xl px-4 pb-16">
        <h2 className="t-h2">{ru.landing.howTitle}</h2>
        <ol className="mt-6 grid gap-8 sm:grid-cols-3">
          {[
            { t: ru.landing.step1Title, d: ru.landing.step1Text },
            { t: ru.landing.step2Title, d: ru.landing.step2Text },
            { t: ru.landing.step3Title, d: ru.landing.step3Text },
          ].map((s, i) => (
            <li key={s.t} className="border-t border-line-2 pt-4">
              <span className="t-caption text-recognition tabular-nums">0{i + 1}</span>
              <h3 className="t-h3 mt-1.5">{s.t}</h3>
              <p className="t-body mt-2 muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Отстройка от бирж/соцсетей */}
      <section className="mx-auto w-full max-w-4xl px-4 pb-24">
        <div className="border-t border-line-2 pt-5">
          <h2 className="t-h2">{ru.landing.whyTitle}</h2>
          <p className="t-body-lg mt-3 max-w-prose muted">{ru.landing.whyText}</p>
        </div>
      </section>
    </main>
  );
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="t-h3">{title}</h2>
      {href && (
        <Link href={href} className="t-caption shrink-0 text-recognition transition hover:underline">
          {ru.landing.seeAll} →
        </Link>
      )}
    </div>
  );
}
