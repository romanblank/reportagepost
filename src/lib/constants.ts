export const APP_NAME = 'Reportage Post';
export const APP_DOMAIN = 'reportagepost.com';

// Глобальный задел: локали расширяются без переезда URL (/ru/, /en/, …)
export const DEFAULT_LOCALE = 'ru';
export const SUPPORTED_LOCALES = ['ru'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

// ИНВАРИАНТ (GLOBAL-PLAN S4): до публичного запуска платформа закрыта для индексации.
// Переключается ТОЛЬКО явным пунктом плана S4.
export const PUBLIC_LAUNCH = false;
