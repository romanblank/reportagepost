'use client';

import { ru } from '@/i18n/ru';
import { usePathname } from 'next/navigation';

// Хром сайта (шапка/подвал/таб-бар) прячется на auth-роутах — там своя брендовая
// сцена на весь экран (AuthScene), без маркетингового обрамления.
const BARE_PREFIXES = ['/ru/login', '/ru/register', '/ru/forgot', '/ru/reset', '/ru/auth'];

export function Chrome({
  header,
  footer,
  mobileTab,
  cookie,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  mobileTab: React.ReactNode;
  cookie: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const bare = BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (bare) return <>{children}</>;

  return (
    <>
      {/* Ссылка «к содержимому» — первое, что получает фокус. До неё
          клавиатурному посетителю приходилось на КАЖДОЙ странице проходить
          логотип, семь пунктов меню, поиск, колокол и две кнопки входа. */}
      <a href="#main" className="skip-link">{ru.nav.skipToContent}</a>
      {header}
      <div id="main">{children}</div>
      {footer}
      {cookie}
      {mobileTab}
    </>
  );
}
