import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import 'dotenv/config';
import {
  LEGACY_ORIGINAL,
  MIN_LONG_SIDE,
  PHOTO_VARIANTS,
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

  it('анализ ≥ MIN_LONG_SIDE даёт размеры и phash; запись кладёт 4 варианта', async () => {
    const big = await makeJpeg(MIN_LONG_SIDE, 1600);
    const analyzed = await analyzePhoto(big);
    expect(analyzed.width).toBe(MIN_LONG_SIDE);
    expect(analyzed.phash).toHaveLength(16);
    expect(analyzed.blurData).toMatch(/^data:image\/jpeg;base64,/); // LQIP-плейсхолдер

    const stored = await storePhotoVariants(big);
    expect(stored.storageKey).toMatch(/^photos\/[0-9a-f-]+\/web\.jpg$/);

    const { storage } = await import('@/lib/storage');
    const base = stored.storageKey.replace(/\/web\.jpg$/, '');
    for (const variant of PHOTO_VARIANTS) {
      const data = await storage.get(`${base}/${variant}`);
      expect(data, variant).not.toBeNull();
    }
    // web-вариант ужат до 2048
    const webMeta = await sharp((await storage.get(stored.storageKey))!).metadata();
    expect(Math.max(webMeta.width!, webMeta.height!)).toBeLessThanOrEqual(2048);
  });

  /**
   * Полноразмерный оригинал не хранится с 2026-08-14: его не читало ничто, а
   * весил он 84% кадра. Тест стережёт именно это — не «мы не пишем файл», а
   * «после загрузки в хранилище его НЕТ». Проверка через список записи была бы
   * тавтологией: сверять код с самим собой.
   */
  it('полноразмерный оригинал в хранилище не появляется', async () => {
    const big = await makeJpeg(MIN_LONG_SIDE, 1600);
    const stored = await storePhotoVariants(big);
    const { storage } = await import('@/lib/storage');
    const base = stored.storageKey.replace(/\/web\.jpg$/, '');

    expect(await storage.get(`${base}/${LEGACY_ORIGINAL}`)).toBeNull();
    expect(PHOTO_VARIANTS as readonly string[]).not.toContain(LEGACY_ORIGINAL);
  });

  it('URL вариантов строятся из ключа кадра — и нового, и старого', () => {
    // Новый ключ указывает на web-вариант
    expect(webVariantUrl('photos/abc/web.jpg')).toBe('/files/photos/abc/web.jpg');
    expect(thumbVariantUrl('photos/abc/web.jpg')).toBe('/files/photos/abc/thumb.jpg');
    // Кадры, залитые до перехода, продолжают адресоваться верно
    expect(webVariantUrl('photos/abc/original.jpg')).toBe('/files/photos/abc/web.jpg');
    expect(thumbVariantUrl('photos/abc/original.jpg')).toBe('/files/photos/abc/thumb.jpg');
  });

  /**
   * Чистка обязана добирать оригинал у старых кадров. Забыть его здесь — это
   * не «немного мусора»: отклонённый по жалобе кадр остался бы раздаваться по
   * прямой ссылке, причём именно в максимальном качестве.
   */
  it('чистка кадра захватывает и варианты, и оригинал старых загрузок', async () => {
    const { photoStorageKeys } = await import('@/lib/photos');
    for (const key of ['photos/abc/web.jpg', 'photos/abc/original.jpg']) {
      const keys = photoStorageKeys(key);
      for (const variant of [...PHOTO_VARIANTS, LEGACY_ORIGINAL]) {
        expect(keys, `${key} → ${variant}`).toContain(`photos/abc/${variant}`);
      }
    }
    // Чужой ключ не порождает выдуманных вариантов
    expect(photoStorageKeys('avatars/xyz.jpg')).toEqual(['avatars/xyz.jpg']);
  });
});

// WebP отдаётся через <picture>, а браузер НЕ откатывается на <img>, если файл
// из <source> вернул 404 — картинка будет просто битой. Поэтому признак
// наличия варианта обязан быть честным.
describe('варианты изображений', () => {
  it('адрес WebP строится только для кадров с известной структурой ключа', async () => {
    const { webpVariantUrl } = await import('@/lib/photos');
    expect(webpVariantUrl('photos/abc/web.jpg', 'web')).toContain('/photos/abc/web.webp');
    expect(webpVariantUrl('photos/abc/web.jpg', 'thumb')).toContain('/photos/abc/thumb.webp');
    // Старый ключ — тот же ответ: кадр не должен «терять» WebP при переходе
    expect(webpVariantUrl('photos/abc/original.jpg', 'web')).toContain('/photos/abc/web.webp');
    // Ключ другой формы (старая схема, аватар) — варианта нет, и врать нельзя
    expect(webpVariantUrl('avatars/xyz.jpg')).toBeNull();
  });

  it('карточка каталога сообщает наличие WebP, а не догадывается о нём', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const card = readFileSync(path.join(process.cwd(), 'src/components/CatalogCards.tsx'), 'utf8');
    // source добавляется под условием, иначе старые кадры сломаются
    expect(card).toMatch(/card\.coverHasWebp && \(/);
    expect(card).toContain('type="image/webp"');
  });
});
