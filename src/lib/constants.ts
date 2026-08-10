export const APP_NAME = 'Репортаж Пост';
export const APP_DOMAIN = 'reportagepost.com';

/**
 * Отправитель транзакционных писем по умолчанию.
 *
 * Был записан строкой в двух местах email.ts: смена адреса чинилась бы в одном
 * из них, а второе продолжало бы слать со старого — и заметили бы это по
 * недоставленным письмам, то есть позже всех.
 */
export const MAIL_FROM_DEFAULT = 'no-reply@reportagepost.com';

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


// Версия согласия на обработку ПДн (152-ФЗ). Растёт при изменении текста
// политики — фиксируется в User.pdnConsentVersion для аудита согласий.
/**
 * Редакция юридических документов, под которой собираются согласия.
 *
 * Метка должна ИДЕНТИФИЦИРОВАТЬ текст, иначе она бесполезна как доказательство:
 * до 2026-08-03 версия оставалась `2026-07-15`, а текст за это время менялся
 * трижды — включая правку, которой в документе впервые назвали оператора
 * персональных данных. То есть у всех согласий стояла метка редакции, которой
 * они не соответствовали.
 *
 * Изменил текст документов — подними эту дату. Забыть нельзя: контрольная
 * сумма текстов зафиксирована в `LEGAL_CONTENT_SHA` и проверяется тестом.
 */
export const PDN_CONSENT_VERSION = '2026-08-03';

/**
 * Контрольная сумма файла юридических текстов для текущей версии.
 *
 * Сторож против бесшумного расхождения «текст поменяли, версию забыли».
 * Обновляется ВМЕСТЕ с `PDN_CONSENT_VERSION`, а не вместо неё.
 */
export const LEGAL_CONTENT_SHA = 'b118a7b8c527801b';

// Имя cookie с решением по трекингу (аудит 2026-08-01, P2). Живёт здесь, а не
// в route-файле: Next.js разрешает роутам экспортировать только свои
// служебные поля и валит сборку на любом постороннем экспорте.
export const COOKIE_CONSENT_NAME = 'rp_consent';
