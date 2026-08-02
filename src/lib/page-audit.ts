/**
 * Детекторы для автоаудитора выдач (`scripts/audit-pages.ts`).
 *
 * Вынесены из скрипта отдельным модулем, чтобы их саму можно было проверить
 * тестом: аудитор, который ничего не находит, неотличим от чистого сайта, и
 * такой «зелёный» опаснее отсутствия проверки.
 */

/** Служебные значения, которым на экране не место — их обязан переводить словарь. */
const ENUM_WORDS = [
  'APPROVED', 'PENDING', 'REJECTED', 'NEEDS_REVISION', 'HIDDEN',
  'PHOTOGRAPHER', 'CLIENT', 'BLOCKED', 'DELETED',
  'PRIME', 'ELITE', 'MONTHLY', 'YEARLY', 'SUCCEEDED',
];

/** Следы незавершённой работы, попавшие в разметку. */
const PLACEHOLDERS = [
  'Lorem ipsum', 'TODO', 'FIXME', '[object Object]',
  'undefined', 'NaN', '{{', '}}', 'Infinity',
];

/**
 * Сырой ключ словаря: `profile.aboutTitle`, `catalog.emptyCity`. Ловим только
 * camelCase после точки — обычная фраза под это не подходит.
 */
const RAW_I18N = /\b[a-z][a-zA-Z]{2,}\.[a-z][a-zA-Z]{3,}\b/g;
/** Домены, файлы и расширения выглядят так же — их исключаем. */
const NOT_I18N = /\.(com|ru|org|net|jpg|jpeg|png|svg|webp|mp4|ts|tsx|js|json|css|local|io|dev)$/;

/**
 * Видимый человеку текст страницы.
 *
 * Вырезать скрипты обязательно: Next встраивает RSC-payload инлайном, и там
 * законно лежат и `APPROVED`, и `null` — без вырезки аудит утонул бы в ложных
 * срабатываниях и его бы отключили.
 */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** Ссылки на медиа, которые страница обещает показать. */
export function mediaRefs(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/(?:src|poster)="(\/[^"]+)"/g)) {
    const url = m[1];
    if (url.startsWith('/files/') || url.startsWith('/_next/image')) out.add(url);
  }
  return [...out];
}

/** Замечания к видимому тексту страницы. Пустой массив — страница чистая. */
export function findTextIssues(text: string): string[] {
  const issues: string[] = [];

  for (const word of ENUM_WORDS) {
    const re = new RegExp(`(^|[^A-Za-z])${word}([^A-Za-z]|$)`);
    if (re.test(text)) issues.push(`служебное значение «${word}» в видимом тексте`);
  }
  for (const ph of PLACEHOLDERS) {
    if (text.includes(ph)) issues.push(`плейсхолдер «${ph}» в тексте`);
  }
  for (const key of text.match(RAW_I18N) ?? []) {
    if (!NOT_I18N.test(key)) issues.push(`похоже на невыведенный ключ словаря «${key}»`);
  }
  return issues;
}
