/**
 * Чистая часть видеопайплайна: разбор ответа ffprobe, гарды по содержимому и
 * сборка аргументов ffmpeg.
 *
 * Отделено от вызовов процессов сознательно — так решения «принимать ли ролик»
 * и «в каком качестве кодировать» проверяются тестами без ffmpeg, машины с
 * кодеками и минуты ожидания. Оркестрация — в `@/lib/video-pipeline`.
 */

/** Потолки входа. Сырое 4K-видео весит непредсказуемо, поэтому режем на границе. */
export const MAX_DURATION_SEC = 90;
export const MIN_DURATION_SEC = 1;
/** Кодеки, которые ffmpeg на нашем образе разбирает без сюрпризов. */
export const ACCEPTED_CODECS = ['h264', 'hevc', 'vp8', 'vp9', 'av1', 'mpeg4'];

export type VideoProbe = {
  durationSec: number;
  width: number;
  height: number;
  codec: string;
  hasAudio: boolean;
};

export type ProbeRejection =
  | 'video_no_stream'
  | 'video_too_long'
  | 'video_too_short'
  | 'video_codec_unsupported';

/**
 * Разбор `ffprobe -show_streams -show_format -of json`.
 *
 * Длительность берётся из формата, а при её отсутствии — из видеопотока:
 * у роликов с телефонов формат иногда приходит без duration, и без запасного
 * источника такой файл отбраковывался бы ни за что.
 */
export function parseProbe(raw: unknown): VideoProbe | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const root = raw as { streams?: unknown; format?: unknown };
  const streams = Array.isArray(root.streams) ? (root.streams as Record<string, unknown>[]) : [];
  const video = streams.find((s) => s.codec_type === 'video');
  if (!video) return null;

  const format = (typeof root.format === 'object' && root.format !== null ? root.format : {}) as Record<string, unknown>;
  const durationRaw = Number(format.duration ?? video.duration ?? NaN);
  const width = Number(video.width ?? NaN);
  const height = Number(video.height ?? NaN);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  return {
    durationSec: Number.isFinite(durationRaw) ? Math.round(durationRaw) : 0,
    width,
    height,
    codec: typeof video.codec_name === 'string' ? video.codec_name : 'unknown',
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}

/** Гард после probe: почему ролик нельзя брать в работу. `null` — можно. */
export function rejectReason(probe: VideoProbe): ProbeRejection | null {
  if (probe.durationSec > MAX_DURATION_SEC) return 'video_too_long';
  if (probe.durationSec < MIN_DURATION_SEC) return 'video_too_short';
  if (!ACCEPTED_CODECS.includes(probe.codec)) return 'video_codec_unsupported';
  return null;
}

export type Variant = { name: 'hd' | 'sd'; height: number; maxrateK: number; bufsizeK: number; audioK: number };

/** 1080p для десктопа, 720p для мобильного — потолки битрейта держат вес и egress. */
export const VARIANTS: Variant[] = [
  { name: 'hd', height: 1080, maxrateK: 4000, bufsizeK: 8000, audioK: 128 },
  { name: 'sd', height: 720, maxrateK: 2500, bufsizeK: 5000, audioK: 96 },
];

/**
 * Какие варианты имеет смысл делать для исходника такой высоты.
 *
 * Апскейл запрещён: из 720p-исходника «1080p» был бы тем же изображением, но
 * вдвое тяжелее — заказчик оплатил бы трафиком нашу же приписку в интерфейсе.
 * Если исходник ниже всех ступеней, кодируем одну — в его собственной высоте.
 */
export function variantsFor(sourceHeight: number): Variant[] {
  const fitting = VARIANTS.filter((v) => v.height <= sourceHeight);
  if (fitting.length > 0) return fitting;
  const smallest = VARIANTS[VARIANTS.length - 1];
  return [{ ...smallest, height: sourceHeight % 2 === 0 ? sourceHeight : sourceHeight - 1 }];
}

/**
 * Аргументы транскода в web-вариант.
 *
 * `-movflags +faststart` обязателен: без него индекс mp4 лежит в конце файла и
 * браузер не начинает проигрывание, пока не скачает ролик целиком.
 * Ширина считается через `-2`, чтобы остаться кратной двум (требование H.264).
 */
export function encodeArgs(input: string, output: string, v: Variant, hasAudio: boolean): string[] {
  return [
    '-y', '-loglevel', 'error', '-i', input,
    '-vf', `scale=-2:${v.height}`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-maxrate', `${v.maxrateK}k`, '-bufsize', `${v.bufsizeK}k`,
    '-pix_fmt', 'yuv420p',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', `${v.audioK}k`] : ['-an']),
    '-movflags', '+faststart',
    output,
  ];
}

/**
 * Аргументы для кадра-обложки.
 *
 * Берём кадр не с нулевой секунды: начало ролика — часто затемнение или
 * титр, и постер получался бы чёрным прямоугольником.
 */
export function posterArgs(input: string, output: string, durationSec: number): string[] {
  const at = Math.max(0, Math.min(durationSec * 0.1, 3));
  return [
    '-y', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', input,
    '-frames:v', '1', '-vf', 'scale=-2:1080', '-q:v', '3', output,
  ];
}

/** Аргументы для кадров премодерации: равномерно по ролику, а не подряд с начала. */
export function keyframeArgs(input: string, pattern: string, durationSec: number, count: number): string[] {
  const fps = Math.max(count / Math.max(durationSec, 1), 0.05);
  return [
    '-y', '-loglevel', 'error', '-i', input,
    '-vf', `fps=${fps.toFixed(4)},scale=-2:720`,
    '-frames:v', String(count), '-q:v', '5', pattern,
  ];
}
