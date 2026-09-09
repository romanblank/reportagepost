'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ru } from '@/i18n/ru';
import { CATALOG_ROOT, FEED_ROOT, isCatalogPath } from '@/lib/nav';

// Нижняя таб-навигация (app-shell как в Instagram/Telegram) — только мобайл.
// Иконки — inline SVG (без внешних зависимостей, работает в Mini App).
interface Tab {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (p: string) => boolean;
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

// Разделы, не влезающие в таб-бар: с телефона до аудита 2026-09-09 Журнал,
// Форум, Сообщество, «Отмеченные», «Избранное» и «О сайте» были НЕДОСТИЖИМЫ
// вовсе (десктоп-меню hidden sm:flex). Шторка «Ещё» — их единственный вход.
function moreLinks(): { href: string; label: string }[] {
  return [
    { href: '/ru/photographers', label: ru.nav.photographersMarked },
    { href: '/ru/match', label: ru.nav.match },
    { href: '/ru/favorites', label: ru.nav.photographersFavorites },
    { href: '/ru/journal', label: ru.nav.journal },
    { href: '/ru/forum', label: ru.nav.forum },
    { href: '/ru/community', label: ru.nav.community },
    { href: '/ru/about', label: ru.nav.aboutMenu },
    { href: '/ru/news', label: ru.nav.aboutNews },
    { href: '/ru/pro', label: ru.pro.navLabel },
  ];
}

export function MobileTabBar({ authed, cabinetHref }: { authed: boolean; cabinetHref: string }) {
  const pathname = usePathname() ?? '/';
  const [moreOpen, setMoreOpen] = useState(false);

  // Переход по ссылке из шторки меняет pathname — шторка закрывается сама.
  // Подстройка состояния ПРИ РЕНДЕРЕ через prev-state (рецепт React «adjust
  // state when props change»): setState в эффекте и ref в рендере запрещены линтом
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    if (moreOpen) setMoreOpen(false);
  }
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  // Позитивный матч активной вкладки (аудит №5): каждая вкладка знает СВОИ
  // маршруты, «Каталог» — гео-пути через isCatalogPath. Незнакомый путь →
  // ни одна не активна (раньше catch-all ложно подсвечивал «Каталог» и двоил).
  const tabs: Tab[] = [
    { href: FEED_ROOT, label: ru.nav.feed, match: (p) => p.startsWith('/ru/photo'),
      icon: <Icon d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" /> },
    { href: CATALOG_ROOT, label: ru.nav.catalog, match: isCatalogPath,
      icon: <Icon d="M4 6h16M4 12h16M4 18h16" /> },
    { href: '/ru/search', label: ru.search.tab, match: (p) => p.startsWith('/ru/search'),
      icon: <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5" /> },
    { href: authed ? '/ru/messages' : '/ru/login', label: ru.nav.messages, match: (p) => p.startsWith('/ru/messages'),
      icon: <Icon d="M4 5h16v11H8l-4 4V5z" /> },
    { href: authed ? cabinetHref : '/ru/register', label: authed ? ru.nav.cabinet : ru.nav.login, match: (p) => p.startsWith('/ru/cabinet') || p === '/ru/login' || p === '/ru/register',
      icon: <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" /> },
  ];

  // Точное сравнение с границей сегмента: startsWith('/ru/pro') подсветил бы
  // и /ru/photographers
  const isAt = (p: string, href: string) => p === href || p.startsWith(`${href}/`);
  // Шторка активна и когда открыта, и когда человек стоит на одном из её разделов
  const onMorePage = moreLinks().some((l) => isAt(pathname, l.href));

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          {/* Клик по подложке закрывает — стандартное поведение шторки */}
          <button type="button" aria-label={ru.nav.close} onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-ink/40" />
          <div role="dialog" aria-label={ru.nav.moreSheetLabel}
            className="absolute inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] rounded-t-md border-t border-line bg-paper p-2 shadow-lg">
            <ul className="grid grid-cols-2 gap-1">
              {moreLinks().map((l) => (
                <li key={l.href}>
                  <Link href={l.href}
                    className={`block rounded-sm px-4 py-3 t-small transition-colors hover:bg-surface-2 ${isAt(pathname, l.href) ? 'text-accent' : 'text-ink-2'}`}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-paper/95 backdrop-blur-md sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${active ? 'text-accent' : 'text-muted'}`}>
              {t.icon}
              <span>{t.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen} aria-label={ru.nav.moreSheetLabel}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${moreOpen || onMorePage ? 'text-accent' : 'text-muted'}`}>
          <Icon d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z" />
          <span>{ru.nav.more}</span>
        </button>
      </nav>
    </>
  );
}
