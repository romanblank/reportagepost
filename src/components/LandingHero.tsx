import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { CATEGORIES } from '@/lib/category-data';
import { CATALOG_ROOT } from '@/lib/nav';
import { HeroSearch } from '@/components/HeroSearch';

// Кинематографичный герой (MyWed-планка+): образ автора на фоне → поиск и
// заголовок поверх скрима. Работа несёт визуал, поиск в центре (директива №1).
export function LandingHero({ photographers, photos, backdropSrc }: {
  photographers: number;
  photos: number;
  backdropSrc: string | null;
}) {
  return (
    <section className="relative isolate flex flex-col items-center justify-center overflow-hidden bg-ink text-center"
      style={{ minHeight: 'clamp(480px, 72vh, 760px)' }}>
      {backdropSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={backdropSrc} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-105 object-cover" />
      ) : (
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 100% at 50% 0%, var(--recognition) 0%, #241a0e 40%, #0a0a0d 100%)' }} />
      )}
      {/* Скрим — читаемость поверх любого кадра */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/60 to-black/80" />

      <div className="anim-rise relative mx-auto w-full max-w-2xl px-4 py-16 sm:py-24">
        <p className="t-caption text-recognition-hi">{ru.landing.kicker}</p>
        <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.05] text-white drop-shadow-sm sm:text-6xl"
          style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>
          {ru.landing.heroTitle}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/85 sm:text-lg">{ru.landing.heroLead}</p>

        <div className="mx-auto mt-8">
          <HeroSearch />
        </div>
        <p className="mt-3 t-caption text-white/70">
          {ru.landing.matchNudge}{' '}
          <Link href="/ru/match" className="text-recognition-hi underline underline-offset-2">{ru.landing.matchNudgeCta}</Link>
        </p>

        <nav className="mt-5 flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((c) => (
            <Link key={c.slug} href={CATALOG_ROOT}
              className="rounded-full border border-white/25 bg-white/5 px-3 py-1.5 text-sm text-white/90 backdrop-blur-sm transition hover:border-white/50 hover:bg-white/10">
              {c.nameRu}
            </Link>
          ))}
        </nav>

        {(photographers > 0 || photos > 0) && (
          <p className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-1 t-caption tabular-nums text-white/70">
            <span><b className="text-white">{photographers}</b> {ru.landing.statAuthors}</span>
            <span><b className="text-white">{photos}</b> {ru.landing.statWorks}</span>
          </p>
        )}

        <p className="mt-5 t-caption text-white/60">
          {ru.landing.heroPhotographerNudge}{' '}
          <Link href="/ru/register" className="text-recognition-hi underline underline-offset-2">{ru.landing.heroPhotographerCta}</Link>
        </p>
      </div>
    </section>
  );
}
