'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ru } from '@/i18n/ru';
import { CATALOG_ROOT } from '@/lib/nav';

/**
 * Панель главного меню с выпадающими подразделами (структура партнёра
 * 2026-08-18): «О сайте», «Фотографы», прямые разделы.
 *
 * Раскрытие — ховером И кликом (аудит 2026-09-09, П2): чистый CSS-hover не
 * открывался тапом на iPad, а клавиатуре не давал закрыть меню Escape-ом.
 * Клик держит меню открытым (aria-expanded), Escape и клик мимо закрывают;
 * ховер продолжает работать как раньше — CSS-класс group сохранён.
 * «Конкурс» из структуры намеренно НЕ здесь: раздел решено держать невидимым
 * до его настоящей проработки.
 */
type MenuChild = { href: string; label: string };
type MenuItem = { label: string; href?: string; children?: MenuChild[]; accent?: boolean };

function menuItems(catalogHref: string): MenuItem[] {
  return [
    {
      label: ru.nav.aboutMenu,
      children: [
        { href: '/ru/about', label: ru.nav.aboutGoal },
        { href: '/ru/legal/offer', label: ru.nav.aboutRules },
        { href: '/ru/legal/privacy', label: ru.nav.aboutPrivacy },
        { href: '/ru/about/feedback', label: ru.nav.aboutFeedback },
        { href: '/ru/news', label: ru.nav.aboutNews },
      ],
    },
    {
      label: ru.nav.photographersMenu,
      // Каталог первым: до живых отметок «Отмеченные» — почти пустая страница,
      // а первый пункт меню и есть «раздел по умолчанию» (design-polish, волна 3)
      children: [
        { href: catalogHref, label: ru.nav.photographersCatalog },
        { href: '/ru/photographers', label: ru.nav.photographersMarked },
        { href: '/ru/match', label: ru.nav.match },
        { href: '/ru/favorites', label: ru.nav.photographersFavorites },
      ],
    },
    { label: ru.nav.feed, href: '/ru/photo' },
    { label: ru.nav.journal, href: '/ru/journal' },
    { label: ru.nav.forum, href: '/ru/forum' },
    { label: ru.nav.community, href: '/ru/community' },
    { label: ru.pro.navLabel, href: '/ru/pro', accent: true },
  ];
}

export function HeaderMenu({ catalogHref }: { catalogHref: string }) {
  const linkCls = 't-small text-muted transition-colors hover:text-ink';
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Переход по ссылке закрывает открытое кликом меню — подстройка при рендере
  // через prev-state (рецепт React): setState в эффекте и ref в рендере
  // запрещены линтом
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    if (open !== null) setOpen(null);
  }
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="hidden items-center gap-4 sm:flex lg:gap-5">
      {menuItems(catalogHref || CATALOG_ROOT).map((item) =>
        item.children ? (
          <div key={item.label} className="group relative">
            {/* Кнопка-заголовок: раскрытие ховером, фокусом и кликом — сам
                заголовок никуда не ведёт, у всех его детей адреса свои */}
            <button
              type="button"
              className={`${linkCls} flex items-center gap-1`}
              aria-haspopup="true"
              aria-expanded={open === item.label}
              onClick={() => setOpen((v) => (v === item.label ? null : item.label))}
            >
              {item.label}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="m2 3.5 3 3 3-3" />
              </svg>
            </button>
            <div className={`absolute left-0 top-full z-50 pt-2 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${open === item.label ? 'visible opacity-100' : 'invisible opacity-0'}`}>
              <ul className="min-w-52 rounded-md border border-line bg-surface p-1.5 shadow-lg">
                {item.children.map((child) => (
                  <li key={child.href}>
                    <Link
                      href={child.href}
                      className="block rounded-sm px-3 py-2 t-small text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      {child.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <Link
            key={item.href}
            href={item.href!}
            className={item.accent ? `${linkCls} text-recognition` : linkCls}
          >
            {item.label}
          </Link>
        ),
      )}
    </div>
  );
}
