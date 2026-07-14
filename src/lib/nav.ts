import type { UserRole } from '@prisma/client';

// Единый источник навигационных маршрутов (аудит-волна №5): раньше cabinetHref
// и catalogHref дублировались в layout/SiteHeader/MobileTabBar → риск рассинхрона.
// Здесь же — определение активной вкладки позитивным матчем (не catch-all).

export const CATALOG_ROOT = '/ru/russia';
export const FEED_ROOT = '/ru/photo';

export function cabinetHrefFor(role: UserRole | undefined): string {
  return role === 'CLIENT' ? '/ru/cabinet/client' : '/ru/cabinet';
}

// Каталог = гео-маршруты (страна/город) под корнем каталога. Позитивный матч:
// НЕ подсвечивает «Каталог» на /ru/login, /ru/onboarding, /ru/photographer и т.д.
// (раньше catch-all-regex давал ложную подсветку и двойное выделение вкладок).
// При добавлении стран — расширять здесь, в единственном месте.
export function isCatalogPath(pathname: string): boolean {
  return pathname === CATALOG_ROOT || pathname.startsWith(`${CATALOG_ROOT}/`);
}
