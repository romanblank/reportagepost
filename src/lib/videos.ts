import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { storage } from '@/lib/storage';

// Загрузка видео автора. Транскод не делаем — храним исходник, браузер играет
// нативно (mp4/webm). Форматы/вес ограничены; ключ — videos/<uuid>/source.<ext>.

export const VIDEO_MIME_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov', // .mov (H.264 обычно играет; иначе автору совет — mp4)
};

export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 МБ — разумный потолок шоурила
export const VIDEO_LIMIT_PER_PROFILE = 6; // до 6 роликов на автора

export class VideoValidationError extends Error {
  constructor(public code: 'unsupported_format' | 'file_too_large' | 'empty', message?: string) {
    super(message ?? code);
    this.name = 'VideoValidationError';
  }
}

/** Валидация загрузки видео (чистая, тестируемо): формат + вес. */
export function validateVideoUpload(mimeType: string, sizeBytes: number): { ext: string } {
  if (sizeBytes <= 0) throw new VideoValidationError('empty');
  if (sizeBytes > MAX_VIDEO_BYTES) throw new VideoValidationError('file_too_large');
  const ext = VIDEO_MIME_EXT[mimeType];
  if (!ext) throw new VideoValidationError('unsupported_format');
  return { ext };
}

/** Content-Type по расширению ключа (для раздатчика /files). */
export function contentTypeForKey(key: string): string | null {
  const m = key.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = m?.[1];
  if (!ext) return null;
  const videoByExt: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
  if (videoByExt[ext]) return videoByExt[ext];
  const imgByExt: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };
  return imgByExt[ext] ?? null;
}

/**
 * Записывает видео в хранилище ПОТОКОМ (аудит 2026-08-01, P2).
 *
 * Раньше принимали Buffer: ролик на 200 МБ целиком оказывался в heap
 * единственного контейнера — ровно тот отказ, который уже чинили у раздатчика,
 * только со стороны загрузки. Теперь байты идут сквозь процесс, в памяти —
 * только буфер потока.
 *
 * Вес известен заранее (Content-Length), поэтому валидируется ДО чтения тела:
 * превышение отклоняется, а не «выясняется» после приёма 2 ГБ.
 */
export async function storeVideoStream(
  body: Readable,
  mimeType: string,
  sizeBytes: number,
): Promise<{ storageKey: string; sizeBytes: number }> {
  const { ext } = validateVideoUpload(mimeType, sizeBytes);
  const storageKey = `videos/${randomUUID()}/source.${ext}`;
  await storage.putStream(storageKey, body, mimeType, sizeBytes);
  return { storageKey, sizeBytes };
}
