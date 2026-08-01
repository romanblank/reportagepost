// Единый разбор ответа API в человекочитаемую ошибку (аудит: клиент выбрасывал
// details/429, показывая общее «проверьте поля»). Используется всеми формами.
//
// Строки — из словаря (аудит 2026-08-01, P1): здесь жили зашитые тексты, хотя
// их видит КАЖДЫЙ пользователь при любом сбое формы. Инвариант «строки UI
// только из i18n» держался в компонентах, но протекал в серверных либах.
import { ru } from '@/i18n/ru';

interface ApiErrorBody {
  error?: string;
  details?: Record<string, string[] | undefined>;
  message?: string;
}

/**
 * Возвращает текст ошибки на русском по HTTP-ответу.
 * fieldLabels — карта имён полей (username→«адрес страницы»); codeLabels —
 * карта доменных кодов (email_taken→«этот email занят»).
 */
export async function describeApiError(
  res: Response | null,
  opts: { fieldLabels?: Record<string, string>; codeLabels?: Record<string, string>; fallback?: string } = {},
): Promise<string> {
  if (!res) return ru.formErrors.offline;
  if (res.status === 429) return ru.formErrors.tooMany;

  const body: ApiErrorBody | null = await res.json().catch(() => null);
  const code = body?.error;

  if (code && opts.codeLabels?.[code]) return opts.codeLabels[code];

  if (code === 'validation' && body?.details) {
    const parts = Object.entries(body.details)
      .map(([field, msgs]) => {
        const label = opts.fieldLabels?.[field] ?? field;
        const why = msgs?.[0];
        return why ? `${label}: ${why}` : label;
      });
    if (parts.length > 0) return ru.formErrors.checkFields(parts.join('; '));
  }

  if (body?.message) return body.message;
  return opts.fallback ?? ru.formErrors.generic;
}
