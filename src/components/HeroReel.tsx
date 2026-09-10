'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Фоновый шоурил героя главной («Огни площадки», 2026-09-10).
 *
 * Как у VideoPlayer, качество выбирается по ширине экрана (нативный <video>
 * между <source media> не переключается): на телефоне заказчик платит за
 * трафик сам — ошибаемся в сторону лёгкого варианта. Автоплей только muted +
 * playsinline (иначе iOS его блокирует), poster виден мгновенно — герой не
 * ждёт ни байта видео, чтобы быть кадром.
 *
 * prefers-reduced-motion уважается: вместо видео остаётся постер — герой
 * с движением по умолчанию не имеет права укачивать тех, кто просил его
 * не укачивать.
 */
export function HeroReel({ hdSrc, sdSrc, poster }: {
  hdSrc: string | null;
  sdSrc: string | null;
  poster: string | null;
}) {
  const subscribe = useCallback((onChange: () => void) => {
    const wide = window.matchMedia('(min-width: 900px)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    wide.addEventListener('change', onChange);
    still.addEventListener('change', onChange);
    return () => {
      wide.removeEventListener('change', onChange);
      still.removeEventListener('change', onChange);
    };
  }, []);
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia('(min-width: 900px)').matches,
    () => false,
  );
  const reduced = useSyncExternalStore(
    subscribe,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );

  const src = (wide ? hdSrc ?? sdSrc : sdSrc ?? hdSrc) ?? undefined;

  if (!src || reduced) {
    return poster ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={poster} alt="" aria-hidden fetchPriority="high" decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: 'brightness(0.5)' }} />
    ) : null;
  }

  return (
    <video
      key={src}
      className="absolute inset-0 h-full w-full object-cover"
      style={{ filter: 'brightness(0.55)' }}
      src={src}
      poster={poster ?? undefined}
      muted
      autoPlay
      loop
      playsInline
      preload="metadata"
      aria-hidden
    />
  );
}
