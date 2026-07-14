// Единый разбор ответа API в человекочитаемую ошибку (аудит: клиент выбрасывал
// details/429, показывая общее «проверьте поля»). Используется всеми формами.

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
  opts: { fieldLabels?: Record<string, string>; codeLabels?: Record<string, string>; fallback: string } = { fallback: 'Что-то пошло не так. Попробуйте ещё раз.' },
): Promise<string> {
  if (!res) return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
  if (res.status === 429) return 'Слишком много попыток. Подождите минуту и попробуйте снова.';

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
    if (parts.length > 0) return `Проверьте поля — ${parts.join('; ')}`;
  }

  if (body?.message) return body.message;
  return opts.fallback;
}
