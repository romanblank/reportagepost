import type { Metadata } from 'next';
import Link from 'next/link';
import { editorsChoice, bestOfWeek } from '@/lib/feeds';
import { freshStories } from '@/lib/discovery';
import { recentPhotographers } from '@/lib/widgets';
import { webVariantUrl, thumbVariantUrl } from '@/lib/photos';
import { cityNameRu } from '@/lib/geo-data';
import { ru } from '@/i18n/ru';
import { FeedMasonry, StoryCards } from '@/components/FeedGallery';

export const metadata: Metadata = { title: ru.journal.metaTitle };
export const dynamic = 'force-dynamic';

// Editorial-слой: кураторский «Журнал» — превращает каталог в место назначения.
// Кураторский ВИД существующих данных (выбор редакции/лучшее/истории/новые имена).
export default async function JournalPage() {
  const [editors, week, stories, newcomers] = await Promise.all([
    editorsChoice(24),
    bestOfWeek(1),
    freshStories(6),
    recentPhotographers(6),
  ]);

  const featured = editors[0] ?? week[0] ?? null;
  const editorsRest = featured ? editors.filter((p) => p.photoId !== featured.photoId) : editors;
  const isEmpty = !featured && stories.length === 0 && newcomers.length === 0;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
      <header className="max-w-2xl">
        <p className="t-caption text-recognition">{ru.journal.kicker}</p>
        <h1 className="t-h1 mt-2 text-balance">{ru.journal.title}</h1>
        <p className="mt-3 t-body-lg muted">{ru.journal.lead}</p>
      </header>

      {isEmpty ? (
        <div className="mt-10 rounded-media border border-dashed border-line-2 p-10 text-center">
          <p className="muted">{ru.journal.empty}</p>
          <Link href="/ru/register" className="btn btn-accent mt-4 px-5">{ru.journal.emptyCta}</Link>
        </div>
      ) : (
        <>
          {featured && (
            <section className="reveal-on-scroll mt-9">
              <h2 className="t-caption text-recognition">{ru.journal.featuredTitle}</h2>
              <Link href={`/ru/photographer/${featured.username}`}
                className="group relative mt-3 block overflow-hidden rounded-media bg-ink">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={webVariantUrl(featured.storageKey)} alt="" loading="eager"
                  className="max-h-[68vh] w-full object-cover transition duration-700 group-hover:scale-[1.02]" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-7">
                  <span className="text-lg font-medium text-white drop-shadow-sm sm:text-2xl"
                    style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>
                    {featured.firstName} {featured.lastName}
                  </span>
                  <span className="shrink-0 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-sm text-white backdrop-blur-sm transition group-hover:bg-white/20">
                    {ru.journal.viewAuthor}
                  </span>
                </span>
              </Link>
            </section>
          )}

          {editorsRest.length > 0 && (
            <section className="reveal-on-scroll mt-12">
              <h2 className="t-h3">{ru.journal.editorsTitle}</h2>
              <div className="mt-4"><FeedMasonry photos={editorsRest} /></div>
            </section>
          )}

          {stories.length > 0 && (
            <section className="reveal-on-scroll mt-12">
              <h2 className="t-h3">{ru.journal.storiesTitle}</h2>
              <div className="mt-4"><StoryCards stories={stories} /></div>
            </section>
          )}

          {newcomers.length > 0 && (
            <section className="reveal-on-scroll mt-12">
              <h2 className="t-h3">{ru.journal.newNamesTitle}</h2>
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {newcomers.map((p) => (
                  <li key={p.username}>
                    <Link href={`/ru/photographer/${p.username}`} className="group block">
                      <div className="aspect-square overflow-hidden rounded-lg bg-surface-2">
                        {p.photos[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbVariantUrl(p.photos[0].storageKey)} alt="" loading="lazy"
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]" />
                        )}
                      </div>
                      <span className="mt-1.5 block truncate text-sm font-medium">{p.user.firstName} {p.user.lastName}</span>
                      <span className="block truncate text-xs muted">{cityNameRu(p.city.slug)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
