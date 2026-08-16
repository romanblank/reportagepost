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
// libvips по умолчанию берёт столько потоков, сколько ядер, и каждый держит
// свои промежуточные буферы. На машине с двумя гигабайтами это прямой путь к
// OOM при паре одновременных загрузок.
sharp.concurrency(1);

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
 * Процессный семафор обработки изображений (аудит 2026-08-16, P1).
 *
 * `sharp.concurrency(1)` ограничивает потоки libvips ВНУТРИ одной операции,
 * но не число одновременных загрузок: rate-limit по 60 файлов/час — на
 * ПОЛЬЗОВАТЕЛЯ, и десять авторов, заливающих портфолио в один день онбординга
 * беты, держали в контейнере на 1400 МБ десять 40-МБ буферов с каскадами
 * распакованных слоёв. Три одновременные обработки — потолок; сверх — честный
 * 429 «попробуйте через минуту», который лучше OOM всего сайта.
 */
const MAX_CONCURRENT_PROCESSING = 3;
let processingNow = 0;

export class PhotoBusyError extends Error {
  constructor() {
    super('too_many_concurrent_uploads');
  }
}

export async function withPhotoSlot<T>(work: () => Promise<T>): Promise<T> {
  if (processingNow >= MAX_CONCURRENT_PROCESSING) throw new PhotoBusyError();
  processingNow += 1;
  try {
    return await work();
  } finally {
    processingNow -= 1;
  }
}

/**
 * Стадия 2 — варианты (web 2048, thumb 640) в хранилище. EXIF вычищается
 * (rotate применяет ориентацию до удаления метаданных).
 *
 * Полноразмерный оригинал НЕ хранится (решение 2026-08-14). Он не читался
 * ничем: раздатчик отдаёт web/thumb, презентация берёт web, премодерация
 * работает с буфером до сохранения. При этом на кадре с 24-мегапиксельной
 * камеры оригинал — 4,5 МБ из 5,4, то есть 84% всего хранилища уходило на
 * файл, который никто не открывает. Печать с платформы не идёт: заказчик
 * получает файлы у автора напрямую, поэтому 2048 px хватает с запасом.
 */
export async function storePhotoVariants(input: Buffer): Promise<{ storageKey: string }> {
  const id = randomUUID();
  const base = `photos/${id}`;
  // Каскад, а не пять независимых обработок исходника.
  //
  // Раньше каждый вариант декодировал ИСХОДНЫЙ буфер заново: пять проходов на
  // storePhotoVariants плюс два в analyzePhoto. На 50-мегапиксельном кадре один
  // распакованный слой — сотни мегабайт, а память контейнера всего два
  // гигабайта: три одновременные загрузки клали прод. Теперь исходник
  // разбирается один раз, дальше уменьшенные варианты строятся из веб-версии.
  const rotated = await img(input).rotate().toBuffer();
  const web = await img(rotated).resize(2048, 2048, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
  // Миниатюра и WebP — уже из веб-варианта: он меньше исходника на порядок, а
  // визуальная разница на 640px неразличима
  const thumb = await img(web).resize(640, 640, { fit: 'inside' }).jpeg({ quality: 78 }).toBuffer();
  const webWebp = await img(web).webp({ quality: 80 }).toBuffer();
  const thumbWebp = await img(thumb).webp({ quality: 76 }).toBuffer();

  await storage.put(`${base}/web.jpg`, web, 'image/jpeg');
  await storage.put(`${base}/thumb.jpg`, thumb, 'image/jpeg');
  await storage.put(`${base}/web.webp`, webWebp, 'image/webp');
  await storage.put(`${base}/thumb.webp`, thumbWebp, 'image/webp');

  return { storageKey: `${base}/web.jpg` };
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

/**
 * Папка кадра по его ключу.
 *
 * Ключей два поколения: до 2026-08-14 запись указывала на `original.jpg`,
 * после — сразу на `web.jpg`. Разбирать это в каждом месте нельзя: ровно так
 * появляются варианты, о которых знает не весь код (уже стоило нам вечно
 * раздающегося WebP у отклонённых кадров). Место разбора одно — здесь.
 *
 * `null` — ключ не из наших вариантов (аватар, чужой формат): такой адресуется
 * как есть.
 */
export function photoBase(storageKey: string): string | null {
  const slash = storageKey.lastIndexOf('/');
  if (slash < 0) return null;
  const name = storageKey.slice(slash + 1);
  const known = name === LEGACY_ORIGINAL || (PHOTO_VARIANTS as readonly string[]).includes(name);
  return known ? storageKey.slice(0, slash) : null;
}

/** Ключ веб-варианта — для тех, кто читает файл из хранилища напрямую (PDF). */
export function webVariantKey(storageKey: string): string {
  const base = photoBase(storageKey);
  return base ? `${base}/web.jpg` : storageKey;
}

/** URL веб-варианта по ключу кадра. */
export function webVariantUrl(storageKey: string): string {
  return storage.publicUrl(webVariantKey(storageKey));
}

export function thumbVariantUrl(storageKey: string): string {
  const base = photoBase(storageKey);
  return storage.publicUrl(base ? `${base}/thumb.jpg` : storageKey);
}

/**
 * Все объекты хранилища, принадлежащие кадру.
 *
 * Как и у видео (`videoStorageKeys`), место одно: отклонение модератором,
 * удаление автором и удаление аккаунта должны чистить один и тот же набор.
 * Рассинхрон уже стоил того, что отклонённый кадр продолжал раздаваться.
 */
export function photoStorageKeys(storageKey: string): string[] {
  const base = photoBase(storageKey);
  if (!base) return [storageKey];
  // Оригинал в списке УДАЛЕНИЯ, хотя больше не пишется: у кадров, залитых до
  // 2026-08-14, он лежит в бакете, и забыть его здесь значит оставить самый
  // тяжёлый файл раздаваться по прямой ссылке после отклонения по жалобе.
  // Удаление отсутствующего объекта безвредно — S3 идемпотентен, дисковый
  // адаптер глотает ENOENT.
  return [...PHOTO_VARIANTS.map((v) => `${base}/${v}`), `${base}/${LEGACY_ORIGINAL}`];
}

/** Имена объектов, которые создаёт `storePhotoVariants`. Единственный список. */
export const PHOTO_VARIANTS = ['web.jpg', 'thumb.jpg', 'web.webp', 'thumb.webp'] as const;

/** Полноразмерный оригинал — только у кадров до 2026-08-14. Не создаётся. */
export const LEGACY_ORIGINAL = 'original.jpg';

/**
 * Адрес WebP-варианта. `null`, если кадр загружен до появления формата —
 * такие показываются JPEG-ом, и это нормально: перекодировать архив ради
 * нескольких процентов трафика дороже, чем оставить как есть.
 */
export function webpVariantUrl(storageKey: string, kind: 'web' | 'thumb' = 'web'): string | null {
  const base = photoBase(storageKey);
  return base ? storage.publicUrl(`${base}/${kind}.webp`) : null;
}
