// Деньги: только минорные единицы (инвариант CLAUDE.md). Форматирование — на выводе.
const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

export function formatRubMinor(priceMinor: number): string {
  return rubFormatter.format(priceMinor / 100);
}
