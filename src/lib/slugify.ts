/**
 * Адрес из русского заголовка.
 *
 * Кириллица в URL работает, но её проносит через почту, мессенджеры и чужие
 * парсеры в виде процентов: ссылка на тему, отправленная коллеге, выглядела бы
 * как строка мусора. Поэтому транслитерируем — адрес остаётся читаемым и
 * пересылаемым.
 */
const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

export function transliterate(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .map((ch) => (ch in MAP ? MAP[ch] : ch))
    .join('');
}

/**
 * Слаг для адреса. Всегда с коротким хвостом от идентификатора: два человека
 * задают один и тот же вопрос чаще, чем кажется, а падать на уникальности
 * заголовка — худший способ об этом узнать.
 */
export function slugifyWithId(title: string, id: string): string {
  const base = transliterate(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  const tail = id.slice(-6);
  return base.length > 0 ? `${base}-${tail}` : tail;
}
