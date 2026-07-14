// Нормализация ввода россиянина в E.164 (аудит: пользователи пишут «8 916…»,
// «+7 (916) 123-45-67» — жёсткий pattern их резал).
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('8') && digits.length === 11) return `+7${digits.slice(1)}`;
  if (digits.startsWith('7') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`; // 9161234567
  return digits ? `+${digits}` : '';
}

// Домен без схемы → https:// (аудит: вводят «mysite.ru» → type=url резал)
export function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}
