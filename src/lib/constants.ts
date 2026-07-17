export const APP_NAME = 'Reportage Post';
export const APP_DOMAIN = 'reportagepost.com';

// Яндекс OAuth. ClientID/секрет — из env (Lockbox: YANDEX_CLIENT_ID,
// YANDEX_OAUTH_SECRET). Redirect ДОЛЖЕН совпадать с указанным в приложении Яндекса.
export const YANDEX_REDIRECT_URI = `https://${APP_DOMAIN}/api/auth/yandex/callback`;
export const YANDEX_OAUTH_SCOPES = 'login:email login:info';

// Глобальный задел: локали расширяются без переезда URL (/ru/, /en/, …)
export const DEFAULT_LOCALE = 'ru';
export const SUPPORTED_LOCALES = ['ru'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

// ИНВАРИАНТ (GLOBAL-PLAN S4): PUBLIC_LAUNCH управляет ТОЛЬКО индексацией
// (robots/meta-noindex). Снимается ТОЛЬКО явным пунктом плана S4.
export const PUBLIC_LAUNCH = false;

// Открытая регистрация БЕЗ приглашения. Расцеплено с PUBLIC_LAUNCH намеренно
// (ребрендинг 2026-07): платформа открыта для регистрации, но остаётся под
// noindex до S4. Инвариант: этот флаг НЕ влияет на robots/meta.
export const OPEN_REGISTRATION = true;

// Версия согласия на обработку ПДн (152-ФЗ). Растёт при изменении текста
// политики — фиксируется в User.pdnConsentVersion для аудита согласий.
export const PDN_CONSENT_VERSION = '2026-07-15';
