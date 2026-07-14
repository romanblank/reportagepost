'use client';

import { useCallback, useEffect, useState } from 'react';

interface LightboxImage {
  src: string;
  width?: number;
  height?: number;
}

// Полноэкранный просмотр фото (MyWed-стандарт): клик по кадру → лайтбокс со
// стрелками, клавиатурой и свайпом-закрытием. Оборачивает сетку миниатюр.
export function LightboxGallery({
  images,
  children,
}: {
  images: LightboxImage[];
  children: (open: (index: number) => void) => React.ReactNode;
}) {
  const [index, setIndex] = useState<number | null>(null);

  const close = useCallback(() => setIndex(null), []);
  const prev = useCallback(() => setIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length)), [images.length]);
  const next = useCallback(() => setIndex((i) => (i === null ? i : (i + 1) % images.length)), [images.length]);

  useEffect(() => {
    if (index === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [index, close, prev, next]);

  const current = index === null ? null : images[index];

  return (
    <>
      {children((i) => setIndex(i))}
      {current && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={close}
          role="dialog"
          aria-modal="true"
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
            onClick={close}
            aria-label="Закрыть"
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-white transition hover:bg-white/20"
          >
            ✕
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white/70">
            {index! + 1} / {images.length}
          </span>
        </div>
      )}
    </>
  );
}
