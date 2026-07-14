import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { computeDHash, hammingDistanceHex, isNearDuplicate, NEAR_DUP_MAX } from '@/lib/phash';

// Генерим сырое RGB-изображение по функции пикселя → JPEG-буфер (как реальная загрузка).
async function makeJpeg(w: number, h: number, px: (x: number, y: number) => number): Promise<Buffer> {
  const data = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(255, Math.round(px(x, y))));
      const i = (y * w + x) * 3;
      data[i] = v; data[i + 1] = v; data[i + 2] = v;
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

const diagonal = (w: number, h: number) => (x: number, y: number) => ((x / (w - 1)) + (y / (h - 1))) / 2 * 255;

describe('phash: hammingDistanceHex (чистая функция)', () => {
  it('равные → 0, инверсные → 64', () => {
    expect(hammingDistanceHex('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistanceHex('ffffffffffffffff', '0000000000000000')).toBe(64);
    expect(hammingDistanceHex('0000000000000000', '0000000000000001')).toBe(1);
  });
  it('разная длина → ошибка', () => {
    expect(() => hammingDistanceHex('ff', 'ffff')).toThrow();
  });
});

describe('phash: computeDHash + дедуп (sharp, без БД)', () => {
  it('одинаковый буфер → расстояние 0', async () => {
    const a = await makeJpeg(300, 200, diagonal(300, 200));
    const h1 = await computeDHash(a);
    const h2 = await computeDHash(a);
    expect(h1).toHaveLength(16);
    expect(hammingDistanceHex(h1, h2)).toBe(0);
  });

  it('тот же кадр после ресайза и пережатия → почти дубликат (≤порога)', async () => {
    const big = await makeJpeg(600, 400, diagonal(600, 400));
    const small = await sharp(big).resize(240, 160).jpeg({ quality: 60 }).toBuffer();
    const dist = hammingDistanceHex(await computeDHash(big), await computeDHash(small));
    expect(dist).toBeLessThanOrEqual(NEAR_DUP_MAX);
    expect(isNearDuplicate(await computeDHash(big), await computeDHash(small))).toBe(true);
  });

  it('структурно разные кадры → далеко (>порога), не дубликат', async () => {
    const diag = await makeJpeg(300, 200, diagonal(300, 200)); // яркость растёт по диагонали
    const stripes = await makeJpeg(300, 200, (x) => (Math.floor(x / 12) % 2) * 255); // вертикальные полосы
    const dist = hammingDistanceHex(await computeDHash(diag), await computeDHash(stripes));
    expect(dist).toBeGreaterThan(NEAR_DUP_MAX);
    expect(isNearDuplicate(await computeDHash(diag), await computeDHash(stripes))).toBe(false);
  });
});
