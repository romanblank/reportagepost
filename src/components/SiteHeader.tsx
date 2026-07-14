import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { ru } from '@/i18n/ru';
import { CATALOG_ROOT, cabinetHrefFor } from '@/lib/nav';
import { LogoutButton } from './LogoutButton';

// Session-aware шапка (аудит: продукт был недостижим без ручного ввода URL).
// Серверный компонент — знает роль и город фотографа для «умных» ссылок.
export async function SiteHeader() {
  const session = await getSession();

  // Каталог → обзор городов; кабинет зависит от роли (единый источник — nav.ts)
  const catalogHref = CATALOG_ROOT;
  const cabinetHref = cabinetHrefFor(session?.role);

  const linkCls = 'text-sm text-muted transition-colors hover:text-ink';
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5">
        <Link href="/" className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" />
          {ru.nav.brand}
        </Link>
        <div className="hidden items-center gap-5 sm:flex">
          <Link href={catalogHref} className={linkCls}>{ru.nav.catalog}</Link>
          <Link href="/ru/photo" className={linkCls}>{ru.nav.feed}</Link>
          <Link href="/ru/community" className={linkCls}>{ru.nav.community}</Link>
          {session && <Link href="/ru/messages" className={linkCls}>{ru.nav.messages}</Link>}
        </div>
        <form method="get" action="/ru/search" className="ml-auto hidden md:block">
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
