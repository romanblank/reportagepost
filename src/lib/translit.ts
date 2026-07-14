// Транслитерация кириллицы в латиницу для авто-username (адрес страницы из
// имени: «Пётр Тестовиков» → «petr-testovikov»). Оператор: не заставлять юзера
// придумывать slug — генерируем, «Изменить» для кастома.
const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Слаг адреса страницы: транслит + строчная латиница/цифры/дефис, 3–30 симв. */
export function slugFromName(...parts: string[]): string {
  const raw = parts.join('-').toLowerCase();
  let out = '';
  for (const ch of raw) {
    if (ch in MAP) out += MAP[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/[\s_-]/.test(ch)) out += '-';
    // прочее (эмодзи, знаки) — отбрасываем
  }
  return out.replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}
