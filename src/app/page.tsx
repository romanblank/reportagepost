import Link from "next/link";
import { ru } from "@/i18n/ru";
import { editorsChoice, bestOfWeek, freshPhotos } from "@/lib/feeds";
import { categoryPreviews, freshStories } from "@/lib/discovery";
import { communityStats } from "@/lib/widgets";
import { webVariantUrl } from "@/lib/photos";
import { db } from "@/lib/db";
import { LandingHero } from "@/components/LandingHero";
import { FeedMasonry, FeedRow, StoryCards } from "@/components/FeedGallery";

// force-dynamic: главная тянет ленты из БД (урок: static-страница с запросом
// падает на пререндере в Docker-билде без DATABASE_URL).
export const dynamic = "force-dynamic";

// Discovery-главная (модель MyWed): герой-поиск → жанры → выбор редакции →
// лучшее недели → свежее → сообщество. Пустые ленты честно скрываются.
export default async function Home() {
  const [editors, week, fresh, stories, cats, stats, photographers, photos] = await Promise.all([
    editorsChoice(9),
    bestOfWeek(12),
    freshPhotos(16),
    freshStories(6),
    categoryPreviews(),
    communityStats(),
    db.photographerProfile.count({ where: { status: "APPROVED" } }),
    db.photo.count({ where: { status: "APPROVED" } }),
  ]);

  const statTiles = [
    { label: ru.dashboard.statPhotographers, value: stats.photographers },
    { label: ru.dashboard.statPhotos, value: stats.photos },
    { label: ru.dashboard.statCities, value: stats.cities },
    { label: ru.dashboard.statStories, value: stats.stories },
  ].filter((t) => t.value > 0);

  return (
    <main className="flex-1">
      <LandingHero photographers={photographers} photos={photos} />

      {/* Жанры репортажа — навигационные карточки (всегда, даже пустые: показывают охват) */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-14">
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
                  // Пустой жанр (бета): чистая тайл-подача, без фейк-градиента
                  <div className="flex aspect-[3/2] w-full flex-col justify-end p-3">
                    <span className="font-medium leading-tight">{c.nameRu}</span>
                    <span className="mt-0.5 text-xs text-muted-2 transition group-hover:text-recognition">{ru.landing.categoryExplore}</span>
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {editors.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-12 sm:pb-14">
          <SectionHeader title={ru.landing.discoverEditors} href="/ru/photo?tab=editors" />
          <div className="mt-4"><FeedRow photos={editors} /></div>
        </section>
      )}

      {week.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-12 sm:pb-14">
          <SectionHeader title={ru.landing.discoverWeek} href="/ru/photo?tab=week" />
          <div className="mt-4"><FeedMasonry photos={week} /></div>
        </section>
      )}

      {fresh.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-12 sm:pb-14">
          <SectionHeader title={ru.landing.recentWork} href="/ru/photo?tab=fresh" />
          <div className="mt-4"><FeedMasonry photos={fresh} /></div>
        </section>
      )}

      {stories.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-12 sm:pb-14">
          <SectionHeader title={ru.landing.discoverStories} />
          <div className="mt-4"><StoryCards stories={stories} /></div>
        </section>
      )}

      {statTiles.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-14">
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

      <section className="mx-auto grid w-full max-w-4xl gap-x-12 gap-y-8 px-4 pb-16 sm:grid-cols-2">
        <div className="border-t border-line-2 pt-5">
          <h2 className="t-h3">{ru.landing.forPhotographers}</h2>
          <p className="t-body mt-2.5 max-w-prose muted">{ru.landing.forPhotographersText}</p>
        </div>
        <div className="border-t border-line-2 pt-5">
          <h2 className="t-h3">{ru.landing.forClients}</h2>
          <p className="t-body mt-2.5 max-w-prose muted">{ru.landing.forClientsText}</p>
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
