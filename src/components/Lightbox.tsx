'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  // Модалка рендерится порталом в body: иначе inert на контейнере страницы
  // погасил бы и её саму — она лежит внутри этого же дерева.

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
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowLeft') { prev(); return; }
      if (e.key === 'ArrowRight') { next(); return; }
      if (e.key !== 'Tab') return;

      // Замыкаем Tab внутри диалога (аудит 2026-08-01, P2). Модалка объявляла
      // aria-modal, но фокус свободно уходил на ссылки страницы под оверлеем:
      // человек «проваливался» в невидимый интерфейс и не понимал, где он.
      // Focus-trap — базовое требование WCAG для модалок, а эта модалка в
      // продукте единственная, то есть чинится один раз.
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    returnFocusRef.current = document.activeElement;
    closeRef.current?.focus();

    // Остальная страница на время просмотра недоступна и вспомогательным
    // технологиям, и указателю — иначе screen reader продолжает читать её.
    const root = document.getElementById('app-root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      (returnFocusRef.current as HTMLElement | null)?.focus?.();
    };
  }, [index, close, prev, next]);

  // Свайп — основной жест просмотра галереи на телефоне, а платформа продаёт
  // именно впечатление от фотографий. До этого листать можно было только
  // мелкими круглыми кнопками по краям (аудит 2026-08-01, P2).
  const SWIPE_MIN_PX = 50;
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Вертикальное движение — это скролл или закрытие жестом, не листание
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx > 0) prev();
    else next();
  }

  // На сервере document нет; открытой модалки при первом рендере не бывает
  // (index приходит null), поэтому расхождения гидрации это не создаёт.
  if (index === null || typeof document === 'undefined') return null;
  const current = images[index];
  if (!current) return null;

  return createPortal(
    <div
      ref={dialogRef}
      className="anim-lb-fade fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur-md"
      onClick={close}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label={ru.ui.lightbox.view}
    >
      {images.length > 1 && (
        <button type="button"
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
        <button type="button"
          onClick={(e) => { e.stopPropagation(); next(); }}
          aria-label={ru.ui.lightbox.next}
          className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 sm:right-6"
        >
          <Icon name="chevron-right" size={22} />
        </button>
      )}
      <button type="button"
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
    </div>,
    document.body,
  );
}
