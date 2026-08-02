/**
 * Бренды камер для фильтра каталога (прототип v9, раздел «Техника»).
 *
 * Автор вводит технику свободным текстом («Sony A7 IV», «Canon R5 Mark II»),
 * и по такому полю нельзя ни фильтровать, ни строить индекс. Поэтому при
 * сохранении анкеты из строк вытаскивается канонический бренд и кладётся в
 * отдельное поле `cameraBrands`.
 *
 * Список закрытый: свободный набор бы засорился опечатками («сони», «Sonny»),
 * и фильтр показывал бы десяток вариантов одного и того же.
 */
export const CAMERA_BRANDS = ['Sony', 'Canon', 'Nikon', 'Fujifilm', 'Panasonic', 'Leica'] as const;

export type CameraBrand = (typeof CAMERA_BRANDS)[number];

/** Псевдонимы: как марку пишут в жизни → канон */
const ALIASES: Record<string, CameraBrand> = {
  sony: 'Sony',
  canon: 'Canon',
  nikon: 'Nikon',
  fuji: 'Fujifilm',
  fujifilm: 'Fujifilm',
  panasonic: 'Panasonic',
  lumix: 'Panasonic', // линейка Panasonic, автор чаще пишет именно так
  leica: 'Leica',
};

/** Достаёт бренды из свободного списка техники. Порядок и дубли не важны. */
export function brandsFromCameras(cameras: string[]): CameraBrand[] {
  const found = new Set<CameraBrand>();
  for (const raw of cameras) {
    const first = raw.trim().toLowerCase().split(/[\s\-_]+/)[0];
    const brand = ALIASES[first];
    if (brand) found.add(brand);
  }
  return [...found];
}
