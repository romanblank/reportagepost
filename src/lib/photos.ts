import { randomUUID } from 'node:crypto';
import { DomainError } from '@/lib/errors';
import sharp from 'sharp';
import { storage } from '@/lib/storage';
import { computeDHash } from '@/lib/phash';

// Требование к портфолио (модель MyWed) — константы в photos-constants.ts
// (клиентские компоненты не могут импортировать этот файл из-за sharp).
export { MIN_LONG_SIDE, ONBOARDING_PHOTOS_MIN, ONBOARDING_PHOTOS_MAX } from '@/lib/photos-constants';
import { MIN_LONG_SIDE } from '@/lib/photos-constants';

export interface AnalyzedPhoto {
  width: number;
  height: number;
  phash: string; // perceptual hash для дедупа/анти-кражи
  blurData: string; // крошечный размытый base64 data-URI — плейсхолдер при загрузке
}

export interface ProcessedPhoto extends AnalyzedPhoto {
  storageKey: string; // ключ оригинала; варианты лежат рядом
}

// Наследует DomainError (аудит 2026-08-01, P2). 422: файл дошёл целым, но
// содержимое не годится — это не ошибка синтаксиса запроса.
export class PhotoValidationError extends DomainError {
  constructor(public code: 'not_image' | 'too_small', public detail: string) {
    super(code, 422);
  }
}

// Ограничение декодирования (аудит 2026-07-31, P1 DoS): без limitInputPixels
// «пиксельная бомба» (маленький файл → гигантский холст) съедает память и CPU
// единственного контейнера. 50 Мпикс — с большим запасом над любой камерой
// (даже 100-мегапиксельный кадр среднего формата = 100 Мпикс, но такие в
// репортаже не грузят; при нужде поднять осознанно).
const MAX_INPUT_PIXELS = 50_000_000;
const img = (input: Buffer) => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, sequentialRead: true });

/**
 * Стадия 1 — анализ БЕЗ записи: валидация (guard-проверки программные) + размеры
 * + perceptual hash. Отдельно от записи, чтобы дедуп-проверка отклоняла ДО
 * загрузки в хранилище (иначе осиротевшие файлы в Object Storage).
 */
export async function analyzePhoto(input: Buffer): Promise<AnalyzedPhoto> {
  let meta;
  try {
    meta = await img(input).metadata();
  } catch {
    throw new PhotoValidationError('not_image', 'Файл не является изображением');
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (Math.max(width, height) < MIN_LONG_SIDE) {
    throw new PhotoValidationError(
      'too_small',
      `Длинная сторона ${Math.max(width, height)}px < ${MIN_LONG_SIDE}px`,
    );
  }
  // Perceptual hash — с ориентированного кадра, чтобы повёрнутый ре-аплоад ловился.
  const oriented = await img(input).rotate().toBuffer();
  const phash = await computeDHash(oriented);

  // LQIP-плейсхолдер: крошечный размытый JPEG в base64. Показывается фоном под
  // <img>, пока грузится настоящий кадр (плавная загрузка вместо пустых дыр).
  const tiny = await img(oriented).resize(24, 24, { fit: 'inside' }).blur(1.2).jpeg({ quality: 35 }).toBuffer();
  const blurData = `data:image/jpeg;base64,${tiny.toString('base64')}`;

  return { width, height, phash, blurData };
}

/**
 * Стадия 2 — варианты (web 2048, thumb 640) в хранилище. EXIF вычищается
 * (rotate применяет ориентацию до удаления метаданных).
 */
export async function storePhotoVariants(input: Buffer): Promise<{ storageKey: string }> {
  const id = randomUUID();
  const base = `photos/${id}`;
  const original = await img(input).rotate().jpeg({ quality: 92 }).toBuffer();
  const web = await img(input).rotate().resize(2048, 2048, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
  const thumb = await img(input).rotate().resize(640, 640, { fit: 'inside' }).jpeg({ quality: 78 }).toBuffer();
  // WebP рядом с JPEG: тот же кадр весит примерно на треть меньше, а трафик за
  // просмотр каталога платит заказчик. Формат отдаётся через <picture>, поэтому
  // браузеры без поддержки просто возьмут JPEG.
  const webWebp = await img(input).rotate().resize(2048, 2048, { fit: 'inside' }).webp({ quality: 80 }).toBuffer();
  const thumbWebp = await img(input).rotate().resize(640, 640, { fit: 'inside' }).webp({ quality: 76 }).toBuffer();

  await storage.put(`${base}/original.jpg`, original, 'image/jpeg');
  await storage.put(`${base}/web.jpg`, web, 'image/jpeg');
  await storage.put(`${base}/thumb.jpg`, thumb, 'image/jpeg');
  await storage.put(`${base}/web.webp`, webWebp, 'image/webp');
  await storage.put(`${base}/thumb.webp`, thumbWebp, 'image/webp');

  return { storageKey: `${base}/original.jpg` };
}

/** Аватар: квадрат 400×400 (cover) в хранилище. Уникальный ключ на загрузку —
 *  чтобы не ловить устаревший CDN-кэш при замене. */
export async function processAndStoreAvatar(input: Buffer, profileId: string): Promise<string> {
  try {
    await img(input).metadata();
  } catch {
    throw new PhotoValidationError('not_image', 'Файл не является изображением');
  }
  const key = `avatars/${profileId}/${randomUUID()}.jpg`;
  const jpeg = await img(input).rotate().resize(400, 400, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
  await storage.put(key, jpeg, 'image/jpeg');
  return key;
}

export function avatarUrl(key: string): string {
  return storage.publicUrl(key);
}

/** URL веб-варианта по ключу оригинала. */
export function webVariantUrl(storageKey: string): string {
  return storage.publicUrl(storageKey.replace('/original.jpg', '/web.jpg'));
}

export function thumbVariantUrl(storageKey: string): string {
  return storage.publicUrl(storageKey.replace('/original.jpg', '/thumb.jpg'));
}

/**
 * Все объекты хранилища, принадлежащие кадру.
 *
 * Как и у видео (`videoStorageKeys`), место одно: отклонение модератором,
 * удаление автором и удаление аккаунта должны чистить один и тот же набор.
 * Рассинхрон уже стоил того, что отклонённый кадр продолжал раздаваться.
 */
export function photoStorageKeys(storageKey: string): string[] {
  if (storageKey.endsWith('/original.jpg')) {
    const base = storageKey.slice(0, -'/original.jpg'.length);
    // Ровно то, что кладёт storePhotoVariants — список сверяется тестом.
    // WebP тут не роскошь: именно его предпочитает каталог, и именно он
    // раздавался вечно после отклонения кадра и удаления аккаунта.
    return PHOTO_VARIANTS.map((v) => `${base}/${v}`);
  }
  return [storageKey];
}

/** Имена объектов, которые создаёт `storePhotoVariants`. Единственный список. */
export const PHOTO_VARIANTS = ['original.jpg', 'web.jpg', 'thumb.jpg', 'web.webp', 'thumb.webp'] as const;

/**
 * Адрес WebP-варианта. `null`, если кадр загружен до появления формата —
 * такие показываются JPEG-ом, и это нормально: перекодировать архив ради
 * нескольких процентов трафика дороже, чем оставить как есть.
 */
export function webpVariantUrl(storageKey: string, kind: 'web' | 'thumb' = 'web'): string | null {
  if (!storageKey.endsWith('/original.jpg')) return null;
  const base = storageKey.slice(0, -'/original.jpg'.length);
  return storage.publicUrl(`${base}/${kind}.webp`);
}
