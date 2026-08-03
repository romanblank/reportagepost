'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export function MobileTabBar({ authed, cabinetHref }: { authed: boolean; cabinetHref: string }) {
  const pathname = usePathname() ?? '/';

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

  return (
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
    </nav>
  );
}
