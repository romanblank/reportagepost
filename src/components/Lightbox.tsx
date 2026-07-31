'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ru } from '@/i18n/ru';

export interface LightboxImage {
  src: string;
  width?: number;
  height?: number;
}

// Полноэкранная модалка просмотра (стрелки, клавиатура, a11y-фокус). Управляется
// извне через index/setIndex — чтобы вызывающая client-галерея сама рендерила
// сетку. RSC: серверная страница НЕ может передать функцию в client-компонент,
// поэтому render-prop убран (был источником 500 на профиле/серии).
export function LightboxModal({
  images,
  index,
  setIndex,
}: {
  images: LightboxImage[];
  index: number | null;
  setIndex: (i: number | null) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  const close = useCallback(() => setIndex(null), [setIndex]);
  const prev = useCallback(
    () => setIndex(index === null ? null : (index - 1 + images.length) % images.length),
    [index, images.length, setIndex],
  );
  const next = useCallback(
    () => setIndex(index === null ? null : (index + 1) % images.length),
    [index, images.length, setIndex],
  );

  useEffect(() => {
    if (index === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    returnFocusRef.current = document.activeElement;
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      (returnFocusRef.current as HTMLElement | null)?.focus?.();
    };
  }, [index, close, prev, next]);

  if (index === null) return null;
  const current = images[index];
  if (!current) return null;

  return (
    <div
      className="anim-lb-fade fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur-md"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={ru.ui.lightbox.view}
    >
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          aria-label={ru.ui.lightbox.prev}
          className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 sm:left-6"
        >
          <Icon name="chevron-left" size={22} />
        </button>
      )}
      {/* key={index} — перезапуск zoom-анимации при смене кадра */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={index}
        src={current.src}
        alt=""
        width={current.width}
        height={current.height}
        onClick={(e) => e.stopPropagation()}
        className="anim-lb-zoom max-h-[90vh] max-w-[92vw] rounded-sm object-contain shadow-2xl"
      />
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          aria-label={ru.ui.lightbox.next}
          className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 sm:right-6"
        >
          <Icon name="chevron-right" size={22} />
        </button>
      )}
      <button
        ref={closeRef}
        onClick={close}
        aria-label={ru.ui.close}
        className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
      >
        <Icon name="x" size={18} />
      </button>
      {images.length > 1 && (
        <span className="tnum absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white/80 backdrop-blur-sm">
          {index + 1} / {images.length}
        </span>
      )}
    </div>
  );
}
