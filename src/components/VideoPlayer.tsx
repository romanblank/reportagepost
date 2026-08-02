'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Плеер ролика автора.
 *
 * Качество выбирается по ширине экрана, а не отдаётся одно на всех: 1080p при
 * потолке 4 Мбит/с — это до 45 МБ за просмотр, и на телефоне их оплачивает
 * заказчик своим трафиком. Нативный `<video>` сам между вариантами не
 * переключается (`media` у `<source>` для видео браузеры игнорируют), поэтому
 * выбор делаем здесь.
 *
 * `preload="none"` обязателен: на странице автора роликов несколько, и
 * предзагрузка метаданных каждого стоила бы заказчику мегабайты до того, как он
 * решил хоть что-то смотреть. Постер при этом виден сразу — он лёгкий.
 */
export function VideoPlayer({
  hdSrc,
  sdSrc,
  poster,
  title,
  className,
}: {
  hdSrc: string | null;
  sdSrc: string | null;
  poster: string | null;
  title: string | null;
  className?: string;
}) {
  // Ширина экрана — внешнее состояние браузера, поэтому читаем её подпиской, а
  // не через setState в эффекте: последнее вызывает лишний каскад рендеров.
  // Серверный снимок — «узкий»: ошибиться в сторону лёгкого варианта дешевле
  // для заказчика, чем прислать ему 1080p на телефон.
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia('(min-width: 900px)');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia('(min-width: 900px)').matches,
    () => false,
  );

  const src = (wide ? hdSrc ?? sdSrc : sdSrc ?? hdSrc) ?? undefined;
  if (!src) return null;

  return (
    <video
      src={src}
      poster={poster ?? undefined}
      controls
      playsInline
      preload="none"
      title={title ?? undefined}
      className={className}
    />
  );
}
