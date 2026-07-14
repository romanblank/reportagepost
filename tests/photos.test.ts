import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import 'dotenv/config';
import {
  MIN_LONG_SIDE,
  PhotoValidationError,
  analyzePhoto,
  storePhotoVariants,
  thumbVariantUrl,
  webVariantUrl,
} from '@/lib/photos';

function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 30, b: 30 } },
  })
    .jpeg()
    .toBuffer();
}

describe('photo pipeline', () => {
  it('отклоняет не-изображение', async () => {
    await expect(analyzePhoto(Buffer.from('not an image'))).rejects.toThrow(
      PhotoValidationError,
    );
  });

  it('отклоняет маленькое фото (guard по длинной стороне)', async () => {
    const small = await makeJpeg(800, 600);
    await expect(analyzePhoto(small)).rejects.toMatchObject({ code: 'too_small' });
  });

  it('анализ ≥ MIN_LONG_SIDE даёт размеры и phash; запись кладёт 3 варианта', async () => {
    const big = await makeJpeg(MIN_LONG_SIDE, 1600);
    const analyzed = await analyzePhoto(big);
    expect(analyzed.width).toBe(MIN_LONG_SIDE);
    expect(analyzed.phash).toHaveLength(16);

    const stored = await storePhotoVariants(big);
    expect(stored.storageKey).toMatch(/^photos\/[0-9a-f-]+\/original\.jpg$/);

    const { storage } = await import('@/lib/storage');
    for (const variant of ['original', 'web', 'thumb']) {
      const data = await storage.get(stored.storageKey.replace('original', variant));
      expect(data, variant).not.toBeNull();
    }
    // web-вариант ужат до 2048
    const webMeta = await sharp(
      (await storage.get(stored.storageKey.replace('original', 'web')))!,
    ).metadata();
    expect(Math.max(webMeta.width!, webMeta.height!)).toBeLessThanOrEqual(2048);
  });

  it('URL вариантов строятся из ключа оригинала', () => {
    const key = 'photos/abc/original.jpg';
    expect(webVariantUrl(key)).toBe('/files/photos/abc/web.jpg');
    expect(thumbVariantUrl(key)).toBe('/files/photos/abc/thumb.jpg');
  });
});
