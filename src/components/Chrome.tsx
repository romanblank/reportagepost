'use client';

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
      {header}
      {children}
      {footer}
      {cookie}
      {mobileTab}
    </>
  );
}
