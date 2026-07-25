import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { CATEGORIES } from '@/lib/category-data';
import { CATALOG_ROOT } from '@/lib/nav';
import { HeroSearch } from '@/components/HeroSearch';

// Светлый поиск-первый герой (MyWed-направление): фото несут визуал ниже, герой —
// воздушный, поиск в центре. Золото — единственный акцент.
export function LandingHero({ photographers, photos }: { photographers: number; photos: number }) {
  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto w-full max-w-3xl px-4 py-14 text-center sm:py-20">
        <p className="t-caption text-recognition">{ru.landing.kicker}</p>
        <h1 className="t-h1 mt-3 text-balance">{ru.landing.heroTitle}</h1>
        <p className="mx-auto mt-4 max-w-xl t-body-lg muted">{ru.landing.heroLead}</p>

        <div className="mx-auto mt-7 max-w-xl">
          <HeroSearch />
        </div>

        <nav className="mt-5 flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((c) => (
            <Link key={c.slug} href={CATALOG_ROOT} className="chip shrink-0 text-sm">
              {c.nameRu}
            </Link>
          ))}
        </nav>

        {(photographers > 0 || photos > 0) && (
          <p className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-1 t-caption muted tabular-nums">
            <span><b className="text-ink">{photographers}</b> {ru.landing.statAuthors}</span>
            <span><b className="text-ink">{photos}</b> {ru.landing.statWorks}</span>
          </p>
        )}

        <p className="mt-5 t-caption text-muted-2">
          {ru.landing.heroPhotographerNudge}{' '}
          <Link href="/ru/register" className="text-recognition underline underline-offset-2">{ru.landing.heroPhotographerCta}</Link>
        </p>
      </div>
    </section>
  );
}
