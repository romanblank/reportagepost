import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { unreadNotificationCount } from '@/lib/notifications';
import { ru } from '@/i18n/ru';
import { CATALOG_ROOT, cabinetHrefFor } from '@/lib/nav';
import { LogoutButton } from './LogoutButton';
import { BrandLockup } from './BrandLockup';

// Session-aware шапка (аудит: продукт был недостижим без ручного ввода URL).
// Серверный компонент — знает роль и город фотографа для «умных» ссылок.
export async function SiteHeader() {
  const session = await getSession();

  // Каталог → обзор городов; кабинет зависит от роли (единый источник — nav.ts)
  const catalogHref = CATALOG_ROOT;
  const cabinetHref = cabinetHrefFor(session?.role);
  const unread = session ? await unreadNotificationCount(session.userId) : 0;

  const linkCls = 'text-sm text-muted transition-colors hover:text-ink';
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5">
        <Link href="/" aria-label={ru.nav.brand} className="flex items-center text-ink">
          <BrandLockup className="block h-6 sm:h-7" />
        </Link>
        <div className="hidden items-center gap-5 sm:flex">
          <Link href={catalogHref} className={linkCls}>{ru.nav.catalog}</Link>
          <Link href="/ru/match" className={linkCls}>{ru.nav.match}</Link>
          <Link href="/ru/photo" className={linkCls}>{ru.nav.feed}</Link>
          <Link href="/ru/journal" className={linkCls}>{ru.nav.journal}</Link>
          <Link href="/ru/community" className={linkCls}>{ru.nav.community}</Link>
          <Link href="/ru/pro" className={`${linkCls} text-recognition`}>{ru.pro.navLabel}</Link>
          {session && <Link href="/ru/messages" className={linkCls}>{ru.nav.messages}</Link>}
        </div>
        {session && (
          <Link href="/ru/notifications" aria-label={ru.notifications.title}
            className="relative ml-auto text-muted transition-colors hover:text-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            {unread > 0 && (
              <span className="absolute -right-2 -top-1.5 grid min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-ink">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
        )}
        <form method="get" action="/ru/search" className={`hidden md:block ${session ? 'ml-4' : 'ml-auto'}`}>
          <input name="q" placeholder={ru.search.placeholder}
            className="input h-9 w-44 py-1.5 text-sm" aria-label={ru.search.title} />
        </form>
        {/* На мобиле навигация в нижнем таб-баре — верхний auth-кластер прячем (app-подача) */}
        <div className="ml-auto hidden items-center gap-4 sm:flex md:ml-4">
          {session ? (
            <>
              <Link href={cabinetHref} className={linkCls}>{ru.nav.cabinet}</Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/ru/login" className={linkCls}>{ru.nav.login}</Link>
              <Link href="/ru/register" className="btn btn-accent px-3.5 py-1.5">{ru.nav.register}</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
