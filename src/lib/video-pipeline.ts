import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import { premoderate } from '@/lib/premoderation';
import {
  encodeArgs, keyframeArgs, parseProbe, posterArgs, rejectReason, variantsFor,
  type VideoProbe,
} from '@/lib/video-encode';

/**
 * Обработка загруженного ролика: probe → гард → транскод → постер →
 * премодерация кадров → публикация вариантов.
 *
 * Почему асинхронно, а не в запросе загрузки: транскод минутного ролика
 * занимает десятки секунд процессора. В HTTP-обработчике это держало бы
 * соединение, упиралось в таймауты периметра и роняло бы весь запрос при любой
 * заминке ffmpeg — автор терял бы уже залитый файл.
 *
 * Исходник наружу не отдаётся никогда: его вес и кодек непредсказуемы, а
 * мобильный трафик за просмотр платит заказчик. Раздаются только варианты.
 */
const run = promisify(execFile);

/** Транскод — тяжёлая операция; на одной VM больше пары зараз запускать нельзя. */
export const VIDEO_BATCH = 2;
const FFMPEG_TIMEOUT_MS = 10 * 60_000;
const KEYFRAMES_FOR_MODERATION = 3;

async function ffprobe(file: string): Promise<VideoProbe | null> {
  const { stdout } = await run(
    'ffprobe',
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
    { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
  );
  try {
    return parseProbe(JSON.parse(stdout));
  } catch {
    return null; // битый JSON от ffprobe = нечитаемый файл, а не наша ошибка
  }
}

async function ffmpeg(args: string[]): Promise<void> {
  await run('ffmpeg', args, { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
}

/** Доступен ли ffmpeg. Без него воркер обязан молчать, а не валить очередь. */
export async function hasFfmpeg(): Promise<boolean> {
  return run('ffmpeg', ['-version'], { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
}

async function downloadToFile(key: string, dest: string): Promise<void> {
  const obj = await storage.getStream(key);
  if (!obj) throw new Error(`исходник ${key} не найден в хранилище`);
  await pipeline(Readable.fromWeb(obj.body as unknown as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(dest));
}

async function uploadFile(key: string, file: string, contentType: string): Promise<number> {
  const { size } = await stat(file);
  await storage.putStream(key, Readable.from(await readFile(file)), contentType, size);
  return size;
}

/**
 * Премодерация по кадрам ролика: тот же Vision-guard, что у фото.
 *
 * Вердикт модели сам по себе ничего не публикует и не отклоняет — он лишь
 * решает, отправить ли ролик на глаза редакции (правило проекта: LLM/CV-вывод
 * всегда через программный guard, никогда напрямую).
 */
async function needsReview(dir: string, source: string, probe: VideoProbe): Promise<boolean> {
  await ffmpeg(keyframeArgs(source, path.join(dir, 'kf-%d.jpg'), probe.durationSec, KEYFRAMES_FOR_MODERATION));
  const frames = (await readdir(dir)).filter((f) => f.startsWith('kf-')).sort();
  for (const frame of frames) {
    const verdict = await premoderate(await readFile(path.join(dir, frame)));
    if (verdict && verdict.recommend !== 'ok') return true;
  }
  return false;
}

export type ProcessResult = { id: string; ok: boolean; reason?: string };

/** Обрабатывает один ролик. Ошибки не бросает — записывает их в запись видео. */
export async function processVideo(videoId: string): Promise<ProcessResult> {
  const video = await db.profileVideo.findUnique({ where: { id: videoId } });
  if (!video) return { id: videoId, ok: false, reason: 'not_found' };

  // Захват задачи: пометка PROCESSING одновременно и статус, и блокировка —
  // второй воркер, стартовавший по тому же расписанию, эту запись не возьмёт.
  const claimed = await db.profileVideo.updateMany({
    where: { id: videoId, processing: 'UPLOADED' },
    data: { processing: 'PROCESSING' },
  });
  if (claimed.count === 0) return { id: videoId, ok: false, reason: 'already_claimed' };

  const dir = await mkdtemp(path.join(tmpdir(), 'rp-video-'));
  const fail = async (reason: string): Promise<ProcessResult> => {
    await db.profileVideo.update({
      where: { id: videoId },
      data: { processing: 'FAILED', failureReason: reason, processedAt: new Date() },
    });
    return { id: videoId, ok: false, reason };
  };

  try {
    const ext = path.extname(video.storageKey) || '.mp4';
    const source = path.join(dir, `source${ext}`);
    await downloadToFile(video.storageKey, source);

    const probe = await ffprobe(source);
    if (!probe) return await fail('video_no_stream');
    const rejected = rejectReason(probe, video.maxSeconds);
    if (rejected) return await fail(rejected);

    const base = video.storageKey.replace(/\/source\.[^/]+$/, '');
    let totalBytes = 0;
    const keys: { hdKey?: string; sdKey?: string } = {};

    for (const variant of variantsFor(probe.height)) {
      const out = path.join(dir, `${variant.name}.mp4`);
      await ffmpeg(encodeArgs(source, out, variant, probe.hasAudio));
      const key = `${base}/${variant.name}.mp4`;
      totalBytes += await uploadFile(key, out, 'video/mp4');
      keys[variant.name === 'hd' ? 'hdKey' : 'sdKey'] = key;
    }

    const posterFile = path.join(dir, 'poster.jpg');
    await ffmpeg(posterArgs(source, posterFile, probe.durationSec));
    const posterKey = `${base}/poster.jpg`;
    totalBytes += await uploadFile(posterKey, posterFile, 'image/jpeg');

    const review = await needsReview(dir, source, probe);

    await db.profileVideo.update({
      where: { id: videoId },
      data: {
        processing: 'READY',
        ...keys,
        posterKey,
        durationSec: probe.durationSec,
        width: probe.width,
        height: probe.height,
        codec: probe.codec,
        processedBytes: totalBytes,
        processedAt: new Date(),
        failureReason: null,
        // Спорные кадры уводят ролик к редакции; чистый остаётся опубликованным
        ...(review ? { status: 'PENDING' as const } : {}),
      },
    });

    // Исходник больше не нужен: раздаём только варианты, а держать сырое 4K в
    // бакете — платить за хранение того, что никто никогда не откроет.
    await storage.delete(video.storageKey).catch(() => {});

    return { id: videoId, ok: true };
  } catch (e) {
    // Автору показывается КОД причины, а не текст исключения: в сообщении
    // ffmpeg или хранилища лежат внутренние пути и ключи объектов, а понять по
    // ним всё равно нечего. Подробность остаётся в логе сервера.
    console.error(`[video] ${videoId}:`, e instanceof Error ? e.message : e);
    return await fail('transcode_failed');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Разбирает очередь: до `limit` роликов подряд, самые старые вперёд. */
export async function processVideoQueue(limit = VIDEO_BATCH): Promise<ProcessResult[]> {
  if (!(await hasFfmpeg())) return [];
  const pending = await db.profileVideo.findMany({
    where: { processing: 'UPLOADED' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  const results: ProcessResult[] = [];
  for (const v of pending) results.push(await processVideo(v.id));
  return results;
}
