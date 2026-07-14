// FAQ анкеты хранится JSON-полем — тип «unknown». Разбираем защитно (валидируем
// форму на границе, как любые внешние данные). Чистая функция, тестируемо.

export interface FaqItem {
  q: string;
  a: string;
}

export function parseFaq(raw: unknown): FaqItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FaqItem[] = [];
  for (const x of raw) {
    if (x && typeof x === 'object' && typeof (x as { q?: unknown }).q === 'string' && typeof (x as { a?: unknown }).a === 'string') {
      const q = (x as { q: string }).q.trim().slice(0, 200);
      const a = (x as { a: string }).a.trim().slice(0, 1000);
      if (q && a) out.push({ q, a });
    }
    if (out.length >= 10) break;
  }
  return out;
}
