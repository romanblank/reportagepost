// Отображение дат по-русски (аудит 2026-07-31, P1): в интерфейсе показывались
// ISO-строки «2026-08-14» — это формат хранения, а не то, что читает человек.
// Инвариант проекта не нарушается: в БД и API по-прежнему UTC ISO 8601,
// форматирование — только на отображении.

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** 14 августа 2026 (год опускается, если он текущий: «14 августа»). */
export function formatDateRu(d: Date, now = new Date()): string {
  const day = d.getUTCDate();
  const month = MONTHS_GEN[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return year === now.getUTCFullYear() ? `${day} ${month}` : `${day} ${month} ${year}`;
}

/** 14 августа, 18:30 — для событий, где важно время. */
export function formatDateTimeRu(d: Date, now = new Date()): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${formatDateRu(d, now)}, ${hh}:${mm}`;
}

/**
 * Название месяца в именительном падеже — для заголовка календаря занятости
 * («Занятость · Август»). Существующий MONTHS склоняет («августа»), а в
 * заголовке нужна форма без числа.
 */
const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export function monthLabelRu(d: Date): string {
  return MONTHS_NOM[d.getUTCMonth()];
}

/** Полных часов с момента. Живёт здесь, а не в компоненте: react-compiler
 *  запрещает Date.now() в рендере даже серверных страниц. */
export function hoursSince(d: Date): number {
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 3_600_000));
}
