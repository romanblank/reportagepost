'use client';

import { useCallback, useEffect, useRef } from 'react';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фото"
    >
      <button
        onClick={(e) => { e.stopPropagation(); prev(); }}
        aria-label="Предыдущее"
        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-2xl text-white transition hover:bg-white/20 sm:left-6"
      >
        ‹
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.src}
        alt=""
        width={current.width}
        height={current.height}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[92vw] object-contain"
      />
      <button
        onClick={(e) => { e.stopPropagation(); next(); }}
        aria-label="Следующее"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-2xl text-white transition hover:bg-white/20 sm:right-6"
      >
        ›
      </button>
      <button
        ref={closeRef}
        onClick={close}
        aria-label="Закрыть"
        className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-white transition hover:bg-white/20"
      >
        ✕
      </button>
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white/70">
        {index + 1} / {images.length}
      </span>
    </div>
  );
}
