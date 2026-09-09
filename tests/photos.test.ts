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

/**
 * Семафор одновременных обработок (аудит 2026-08-16, P1): rate-limit — на
 * пользователя, а память контейнера — общая. Сверх трёх слотов — честный
 * отказ, который лучше OOM всего сайта.
 */
describe('семафор обработки изображений', () => {
  it('четвёртая параллельная обработка получает отказ, слот освобождается', async () => {
    const { withPhotoSlot, PhotoBusyError } = await import('@/lib/photos');
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });

    // Три обработки занимают все слоты
    const busy = Array.from({ length: 3 }, () => withPhotoSlot(() => gate.then(() => 'ok')));
    // Дать слотам захватиться
    await new Promise((r) => setTimeout(r, 10));
    // Четвёртая — отказ немедленно, без очереди
    await expect(withPhotoSlot(async () => 'never')).rejects.toThrow(PhotoBusyError);

    release();
    await expect(Promise.all(busy)).resolves.toEqual(['ok', 'ok', 'ok']);
    // После освобождения слоты снова доступны
    await expect(withPhotoSlot(async () => 'again')).resolves.toBe('again');
  });
});

/**
 * Техника из EXIF (партнёр 2026-08-18): читается при загрузке ДО вычистки
 * метаданных. Ручного ввода «чем снято» большинству не понадобится — и
 * статистика техники для партнёров честная, а не самодекларированная.
 */
describe('EXIF: камера и объектив читаются при анализе', () => {
  it('кадр с EXIF отдаёт модель, кадр без EXIF — null', async () => {
    const sharp = (await import('sharp')).default;
    const base = await sharp({
      create: { width: MIN_LONG_SIDE, height: 1600, channels: 3, background: { r: 20, g: 20, b: 20 } },
    }).jpeg().toBuffer();
    const withExif = await sharp(base)
      // sharp пишет Exif-подкаталог под ключом IFD2 — LensModel живёт там
      .withExif({ IFD0: { Make: 'Canon', Model: 'Canon EOS R5' }, IFD2: { LensModel: 'RF 24-70mm F2.8 L' } })
      .jpeg().toBuffer();

    const a = await analyzePhoto(withExif);
    expect(a.cameraModel).toBe('Canon EOS R5'); // марка не дублируется
    expect(a.lensModel).toBe('RF 24-70mm F2.8 L');

    const b = await analyzePhoto(base);
    expect(b.cameraModel).toBeNull();
    expect(b.lensModel).toBeNull();
  });

  // Битые метаданные — норма, а не исключение: редакторы и мессенджеры пишут
  // EXIF как попало. Загрузка кадра от этого падать не должна (аудит 2026-09-09).
  it('искорёженный EXIF не роняет загрузку — кадр проходит без техники', async () => {
    const sharp = (await import('sharp')).default;
    const withExif = await sharp({
      create: { width: MIN_LONG_SIDE, height: 1600, channels: 3, background: { r: 20, g: 20, b: 20 } },
    })
      .withExif({ IFD0: { Make: 'Nikon', Model: 'Nikon Z9' } })
      .jpeg().toBuffer();

    // Портим сам EXIF-блок: sharp его отдаст, exif-reader — не разберёт
    const broken = Buffer.from(withExif);
    const at = broken.indexOf('Exif');
    expect(at).toBeGreaterThan(-1);
    broken.fill(0xff, at + 6, at + 26);

    const a = await analyzePhoto(broken);
    expect(a.width).toBe(MIN_LONG_SIDE); // кадр принят
    expect(a.cameraModel).toBeNull(); // техника честно отсутствует, а не мусор
    expect(a.lensModel).toBeNull();
  });

  it('километровые строки EXIF обрезаются до 120 символов', async () => {
    const sharp = (await import('sharp')).default;
    const longModel = 'X'.repeat(300);
    const longLens = 'Y'.repeat(300);
    const img = await sharp({
      create: { width: MIN_LONG_SIDE, height: 1600, channels: 3, background: { r: 20, g: 20, b: 20 } },
    })
      .withExif({ IFD0: { Make: 'Canon', Model: longModel }, IFD2: { LensModel: longLens } })
      .jpeg().toBuffer();

    const a = await analyzePhoto(img);
    // Поле в анкете и даталистах рассчитано на имя техники, а не на роман:
    // без обрезки мусорная строка уехала бы в статистику сообщества
    expect(a.cameraModel).not.toBeNull();
    expect(a.cameraModel!.length).toBeLessThanOrEqual(120);
    expect(a.lensModel).not.toBeNull();
    expect(a.lensModel!.length).toBeLessThanOrEqual(120);
  });
});
