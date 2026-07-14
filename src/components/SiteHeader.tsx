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

  return (
    <header className="border-b">
      <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <Link href="/" className="font-semibold tracking-tight">{ru.nav.brand}</Link>
        <Link href={catalogHref} className="opacity-70 hover:opacity-100">{ru.nav.catalog}</Link>
        <Link href="/ru/photo" className="opacity-70 hover:opacity-100">{ru.nav.feed}</Link>
        <Link href="/ru/community" className="opacity-70 hover:opacity-100">{ru.nav.community}</Link>
        {session && (
          <Link href="/ru/messages" className="opacity-70 hover:opacity-100">{ru.nav.messages}</Link>
        )}
        <div className="ml-auto flex items-center gap-3">
          {session ? (
            <>
              <Link href={cabinetHref} className="opacity-70 hover:opacity-100">{ru.nav.cabinet}</Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/ru/login" className="opacity-70 hover:opacity-100">{ru.nav.login}</Link>
              <Link href="/ru/register" className="rounded-lg bg-foreground px-3 py-1 text-background">{ru.nav.register}</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
