'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Живая обложка профиля (перк верхнего уровня подписки).
 *
 * Автовоспроизведение включается не всегда, и это не осторожность, а
 * последовательность: ради экономии трафика заказчика мы уже отдаём 720p на
 * узких экранах и не предзагружаем ролики в разделе видео. Обложка, которая
 * молча тянет несколько мегабайт при каждом открытии страницы с телефона,
 * перечеркнула бы всё это.
 *
 * Поэтому ролик играет только на широком экране и только если система не
 * просит уменьшить движение. В остальных случаях остаётся статичный кадр —
 * тот же самый, что служит постером, так что разницы в вёрстке нет.
 */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false, // на сервере считаем, что играть не нужно
  );
}

export function CoverShowreel({
  src,
  poster,
  className,
  style,
}: {
  src: string;
  poster: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const wide = useMediaQuery('(min-width: 900px)');
  const calmMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const play = wide && !calmMotion;

  if (!play) {
    if (!poster) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt="" aria-hidden className={className} style={style} />;
  }

  return (
    <video
      // Safari на iOS не запускает автоплей в режиме энергосбережения и при
      // включённом «уменьшении движения» на уровне системы: тогда остаётся
      // постер — тот же кадр, что служит статичной обложкой, поэтому вёрстка
      // не меняется.
      poster={poster ?? undefined}
      src={src}
      autoPlay
      muted
      loop
      playsInline
      aria-hidden
      className={className}
      style={style}
    />
  );
}
