import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { HeroSearch } from '@/components/HeroSearch';
import { HeroReel } from '@/components/HeroReel';

// Герой «Огни площадки» (2026-09-10): при живом «Шоуриле недели» фоном всего
// первого экрана играет видео (лучшее «на весь экран красивое фото или шоурил»
// — прямой запрос оператора), кредит автора — внизу слева; правая карточка
// «Кадр недели» в этом режиме уступает рилу. Без рила — прежний макет v9:
// приглушённый кадр-фон + карточка. Поиск — первым в обоих режимах.
export function LandingHero({ photographers, photos, backdropSrc, featured, reel }: {
  photographers: number;
  photos: number;
  backdropSrc: string | null;
  featured: { src: string; name: string; href: string; isDemo: boolean } | null;
  reel: { hdSrc: string | null; sdSrc: string | null; poster: string | null;
    name: string; href: string; isDemo: boolean } | null;
}) {
  return (
    <section className="relative isolate flex items-center overflow-hidden bg-paper"
      // svh вместо vh: в мобильном Safari vh не учитывает адресную строку —
      // первый экран вылезал под неё и дёргался при скролле
      style={{ minHeight: 'clamp(560px, 88svh, 900px)' }}>
      {reel ? (
        <HeroReel hdSrc={reel.hdSrc} sdSrc={reel.sdSrc} poster={reel.poster} />
      ) : backdropSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={backdropSrc} alt="" aria-hidden
          // Самый крупный элемент первого экрана — грузим его первым, иначе
          // браузер ставит фон в общую очередь позади шрифтов и скриптов
          fetchPriority="high" decoding="async"
          className="absolute inset-0 h-full w-full scale-105 object-cover"
          style={{ filter: 'brightness(0.42)' }} />
      ) : (
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 100% at 20% 90%, var(--accent) 0%, #1a1210 30%, var(--ink) 70%)' }} />
      )}
      {/* Скрим: тёмный слева под текст, прозрачнее справа под карточку */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(90deg, rgba(15,18,24,.94) 0%, rgba(15,18,24,.78) 42%, rgba(15,18,24,.5) 100%), linear-gradient(0deg, rgba(15,18,24,.85), transparent 40%)' }} />

      <div className="anim-rise relative mx-auto grid w-full max-w-7xl items-center gap-14 px-4 py-20  lg:grid-cols-[1.12fr_.88fr]">
        {/* Левая колонка — текст + поиск */}
        <div className="max-w-2xl">
          <p className="t-caption inline-flex items-center gap-2.5 text-accent before:h-px before:w-6 before:bg-accent">
            {ru.landing.kicker}
          </p>
          {/* Типо-роль вместо зашитых размеров (инвариант спеки), акцент —
              курсивом на глаголе: приём прототипа v9 */}
          <h1 className="t-display mt-5 text-balance text-ink">
            {ru.landing.heroTitleLead}
            <br />
            {ru.landing.heroTitleRest}{' '}
            <em className="not-italic text-accent" style={{ fontStyle: 'italic' }}>{ru.landing.heroTitleAccent}</em>
          </h1>
          <p className="mt-5 max-w-xl t-body-lg text-ink-2">{ru.landing.heroLead}</p>

          {/* Поиск по брифу + жанры одной группой. Отдельный ряд чипов и
              подсказка «опишите задачу — подберём» отсюда убраны: они дублировали
              то, что теперь делает само поле, и на первом экране получалось три
              способа начать вместо одного понятного. */}
          <div className="mt-8 max-w-xl"><HeroSearch /></div>

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

        {/* Правая колонка — featured «Кадр недели»; при живом риле фон и есть
            витрина, вторая рамка рядом с видео дробила бы внимание */}
        {featured && !reel && (
          <Link href={featured.href}
            className="group relative hidden overflow-hidden rounded-media border border-line shadow-xl lg:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={featured.src} alt=""
              className="aspect-[4/5] w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
            <span className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(9,11,15,.9) 0%, transparent 46%)' }} />
            {/* Признание — золото recognition, не оранжевый действия: акцент
                никогда не живёт на изображениях (design-polish, волна 1) */}
            <span className="absolute left-3.5 top-3.5 rounded-md bg-recognition px-3 py-1.5 t-caption text-recognition-ink">
              {ru.landing.featuredBadge}
            </span>
            <span className="absolute inset-x-5 bottom-5">
              <span className="block t-small text-ink-2">
                {ru.landing.featuredShotBy} <b className="text-ink">{featured.name}</b>
                {featured.isDemo && (
                  <span className="ml-2 rounded-sm border border-line px-1.5 py-0.5 t-fine text-muted">
                    {ru.demo.badge}
                  </span>
                )}
              </span>
              <span className="mt-1 block t-caption text-muted transition group-hover:text-ink">
                {ru.landing.featuredViewShot} →
              </span>
            </span>
          </Link>
        )}
      </div>

      {/* Кредит рила — как титр: признание автора живёт на его видео */}
      {reel && (
        <Link href={reel.href}
          className="group absolute bottom-6 left-4 z-10 flex items-center gap-3 sm:left-8">
          <span className="h-0.5 w-6 bg-accent" aria-hidden />
          <span className="t-small text-ink-2">
            <span className="t-caption mr-2 text-recognition">{ru.landing.reelOfWeek}</span>
            <b className="text-ink transition group-hover:text-recognition-hi">{reel.name}</b>
            {reel.isDemo && (
              <span className="ml-2 rounded-sm border border-line px-1.5 py-0.5 t-fine text-muted">
                {ru.demo.badge}
              </span>
            )}
          </span>
        </Link>
      )}
    </section>
  );
}
