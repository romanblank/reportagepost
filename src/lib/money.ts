// Деньги: только минорные единицы (инвариант CLAUDE.md). Форматирование — на выводе.

/** Валюта расчётов. Явная константа, а не литерал по коду — деньги без кода
 *  валюты нарушают инвариант, а задел на мир заявлен с первого дня. */
export const DEFAULT_CURRENCY = 'RUB';
const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

export function formatRubMinor(priceMinor: number): string {
  return rubFormatter.format(priceMinor / 100);
}
