import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';
import { LogoutButton } from './LogoutButton';

// Session-aware шапка (аудит: продукт был недостижим без ручного ввода URL).
// Серверный компонент — знает роль и город фотографа для «умных» ссылок.
export async function SiteHeader() {
  const session = await getSession();

  // Каталог ведём в город фотографа/дефолт Москва — чтобы ссылка была не пустой
  let catalogHref = '/ru/russia/moscow';
  let cabinetHref = '/ru/cabinet';
  if (session) {
    if (session.role === 'CLIENT') cabinetHref = '/ru/cabinet/client';
    if (session.role === 'PHOTOGRAPHER') {
      const profile = await db.photographerProfile.findUnique({
        where: { userId: session.userId },
        select: { city: { select: { slug: true } } },
      });
      if (profile) catalogHref = `/ru/russia/${profile.city.slug}`;
    }
  }

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
        <div className="ml-auto flex items-center gap-4">
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
