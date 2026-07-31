import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { CATEGORIES } from '@/lib/category-data';
import { CATALOG_ROOT } from '@/lib/nav';
import { HeroSearch } from '@/components/HeroSearch';

// Кинематографичный герой v9 (2026-07-30): текст+поиск слева, featured-карточка
// «Кадр недели» справа (алгоритмически — по отклику). Поиск — первым (директива №1).
// Фон — приглушённый кадр под скримом; на мобиле карточка скрывается.
export function LandingHero({ photographers, photos, backdropSrc, featured }: {
  photographers: number;
  photos: number;
  backdropSrc: string | null;
  featured: { src: string; name: string; href: string } | null;
}) {
  return (
    <section className="relative isolate flex items-center overflow-hidden bg-paper"
      style={{ minHeight: 'clamp(560px, 88vh, 900px)' }}>
      {backdropSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={backdropSrc} alt="" aria-hidden
          className="absolute inset-0 h-full w-full scale-105 object-cover"
          style={{ filter: 'brightness(0.42)' }} />
      ) : (
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 100% at 20% 90%, var(--accent) 0%, #1a1210 30%, var(--ink) 70%)' }} />
      )}
      {/* Скрим: тёмный слева под текст, прозрачнее справа под карточку */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(90deg, rgba(15,18,24,.94) 0%, rgba(15,18,24,.78) 42%, rgba(15,18,24,.5) 100%), linear-gradient(0deg, rgba(15,18,24,.85), transparent 40%)' }} />

      <div className="anim-rise relative mx-auto grid w-full max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-[1.12fr_.88fr]">
        {/* Левая колонка — текст + поиск */}
        <div className="max-w-2xl">
          <p className="t-caption inline-flex items-center gap-2.5 text-accent before:h-px before:w-6 before:bg-accent">
            {ru.landing.kicker}
          </p>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.02] text-ink sm:text-5xl lg:text-6xl"
            style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>
            {ru.landing.heroTitle}
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-2 sm:text-lg">{ru.landing.heroLead}</p>

          <div className="mt-8 max-w-xl"><HeroSearch /></div>
          <p className="mt-3 t-caption text-muted">
            {ru.landing.matchNudge}{' '}
            <Link href="/ru/match" className="text-accent underline underline-offset-2">{ru.landing.matchNudgeCta}</Link>
          </p>

          <nav className="mt-5 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Link key={c.slug} href={CATALOG_ROOT}
                className="rounded-full border border-line bg-surface-2/60 px-3.5 py-1.5 text-sm text-ink backdrop-blur-sm transition hover:border-accent hover:text-accent">
                {c.nameRu}
              </Link>
            ))}
          </nav>

          {(photographers > 0 || photos > 0) && (
            <p className="mt-8 flex flex-wrap gap-x-6 gap-y-1 t-caption tabular-nums text-muted">
              <span><b className="text-ink">{photographers}</b> {ru.landing.statAuthors(photographers)}</span>
              <span><b className="text-ink">{photos}</b> {ru.landing.statWorks(photos)}</span>
              <span className="text-muted">
                {ru.landing.heroPhotographerNudge}{' '}
                <Link href="/ru/register" className="text-accent underline underline-offset-2">{ru.landing.heroPhotographerCta}</Link>
              </span>
            </p>
          )}
        </div>

        {/* Правая колонка — featured «Кадр недели» */}
        {featured && (
          <Link href={featured.href}
            className="group relative hidden overflow-hidden rounded-lg border border-line shadow-xl lg:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={featured.src} alt=""
              className="aspect-[4/5] w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
            <span className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(9,11,15,.9) 0%, transparent 46%)' }} />
            <span className="absolute left-3.5 top-3.5 rounded-md bg-accent px-3 py-1.5 t-caption text-accent-ink">
              {ru.landing.featuredBadge}
            </span>
            <span className="absolute inset-x-5 bottom-5">
              <span className="block text-sm text-ink-2">
                {ru.landing.featuredShotBy} <b className="text-accent">{featured.name}</b>
              </span>
              <span className="mt-1 block t-caption text-muted transition group-hover:text-ink">
                {ru.landing.featuredViewShot} →
              </span>
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
