import { randomUUID } from 'node:crypto';
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
}

export interface ProcessedPhoto extends AnalyzedPhoto {
  storageKey: string; // ключ оригинала; варианты лежат рядом
}

export class PhotoValidationError extends Error {
  constructor(public code: 'not_image' | 'too_small', message: string) {
    super(message);
  }
}

/**
 * Стадия 1 — анализ БЕЗ записи: валидация (guard-проверки программные) + размеры
 * + perceptual hash. Отдельно от записи, чтобы дедуп-проверка отклоняла ДО
 * загрузки в хранилище (иначе осиротевшие файлы в Object Storage).
 */
export async function analyzePhoto(input: Buffer): Promise<AnalyzedPhoto> {
  let meta;
  try {
    meta = await sharp(input).metadata();
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
  const oriented = await sharp(input).rotate().toBuffer();
  const phash = await computeDHash(oriented);
  return { width, height, phash };
}

/**
 * Стадия 2 — варианты (web 2048, thumb 640) в хранилище. EXIF вычищается
 * (rotate применяет ориентацию до удаления метаданных).
 */
export async function storePhotoVariants(input: Buffer): Promise<{ storageKey: string }> {
  const id = randomUUID();
  const base = `photos/${id}`;
  const original = await sharp(input).rotate().jpeg({ quality: 92 }).toBuffer();
  const web = await sharp(input).rotate().resize(2048, 2048, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
  const thumb = await sharp(input).rotate().resize(640, 640, { fit: 'inside' }).jpeg({ quality: 78 }).toBuffer();

  await storage.put(`${base}/original.jpg`, original, 'image/jpeg');
  await storage.put(`${base}/web.jpg`, web, 'image/jpeg');
  await storage.put(`${base}/thumb.jpg`, thumb, 'image/jpeg');

  return { storageKey: `${base}/original.jpg` };
}

/** URL веб-варианта по ключу оригинала. */
export function webVariantUrl(storageKey: string): string {
  return storage.publicUrl(storageKey.replace('/original.jpg', '/web.jpg'));
}

export function thumbVariantUrl(storageKey: string): string {
  return storage.publicUrl(storageKey.replace('/original.jpg', '/thumb.jpg'));
}
