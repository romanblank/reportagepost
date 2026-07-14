import sharp from 'sharp';

// Perceptual hash (dHash) для дедупа портфолио: ловим повторную загрузку того же
// кадра и — главное — кражу чужих фото (загрузка снимка другого фотографа).
// dHash устойчив к ресайзу/пережатию/лёгкой правке яркости: сравнивает соседние
// пиксели уменьшенной ЧБ-версии, поэтому реагирует на структуру, не на пиксели.
//
// Ограничение масштаба (S6): поиск ближайшего идёт линейным перебором хешей —
// при росте базы нужен LSH/BK-tree. Сейчас база мала, перебор дёшев.

const HASH_W = 9; // 9 столбцов → 8 сравнений по строке
const HASH_H = 8; // 8 строк → 64 бита

/** 64-битный dHash изображения, hex-строка (16 симв). Чистая функция от буфера. */
export async function computeDHash(input: Buffer): Promise<string> {
  const { data, info } = await sharp(input)
    .grayscale()
    .resize(HASH_W, HASH_H, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels; // после grayscale обычно 1, но не полагаемся — берём шаг
  const lum = (row: number, col: number): number => data[(row * HASH_W + col) * ch];

  const bits: number[] = [];
  for (let row = 0; row < HASH_H; row++) {
    for (let col = 0; col < HASH_W - 1; col++) {
      bits.push(lum(row, col) < lum(row, col + 1) ? 1 : 0);
    }
  }
  // 64 бита → 16 hex-символов
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

const HEX_BITS: Record<string, number> = {};
for (let n = 0; n < 16; n++) HEX_BITS[n.toString(16)] = n;

/** Расстояние Хэмминга двух hex-хешей одинаковой длины (число разных бит). */
export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) throw new Error('phash length mismatch');
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = HEX_BITS[a[i]] ^ HEX_BITS[b[i]];
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

// Порог «почти дубликат»: ≤ NEAR_DUP_MAX бит из 64. Эмпирически ~10 отделяет
// «тот же кадр после ресайза/пережатия» от разных снимков.
export const NEAR_DUP_MAX = 10;

export function isNearDuplicate(a: string, b: string, threshold = NEAR_DUP_MAX): boolean {
  return hammingDistanceHex(a, b) <= threshold;
}
