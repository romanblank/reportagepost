import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { storage } from '@/lib/storage';
import { Readable } from 'node:stream';
import { DomainError, handleRoute } from '@/lib/errors';
import type { ReadableStream as NodeWebReadable } from 'node:stream/web';
import {
  videoStorageKeys,
  storeVideoStream,
  MAX_VIDEO_BYTES,
  VIDEO_MIME_EXT,
} from '@/lib/videos';
import { tierOf } from '@/lib/subscription';
import { videoLimit, videoSecondsLimit } from '@/lib/pricing';

export const maxDuration = 60; // крупная загрузка

/** Лимит выбрали параллельные загрузки — отдельный тип, чтобы откатить файл. */
class VideoLimitError extends DomainError {
  constructor(public limit: number) {
    super('video_limit', 409);
  }
}

async function currentProfile(userId: string) {
  return db.photographerProfile.findUnique({ where: { userId }, select: { id: true, status: true } });
}

// Загрузка видео автора (multipart: file, title?). Публикация после модерации (как фото).
export function POST(req: Request) {
  return handleRoute(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const profile = await currentProfile(session.userId);
  if (!profile) return NextResponse.json({ error: 'no_profile' }, { status: 409 });

  // Сколько роликов можно — зависит от уровня подписки: видео самая дорогая
  // единица контента, и объём здесь гейтится так же, как объём портфолио.
  // Ролик — самая дорогая единица контента: сотни мегабайт трафика, запись в
  // хранилище и ядро процессора на транскод. Без ограничения частоты цикл
  // «загрузил — удалил — загрузил» ничем не сдерживался, а очередь забивалась
  // чужими роликами впереди шоурилов настоящих авторов.
  await rateLimit(`video-upload:user:${session.userId}`, 6, 86_400);

  // И только у автора, прошедшего модерацию: до одобрения анкеты показывать
  // ролик всё равно негде, а транскод уже занят
  if (profile.status !== 'APPROVED') {
    return NextResponse.json({ error: 'profile_not_approved' }, { status: 409 });
  }

  const tier = await tierOf(session.userId);
  const limit = videoLimit(tier);
  // Отбракованные ролики слот не занимают: один неудачный файл иначе
  // блокировал бы бесплатному автору единственную возможность навсегда
  const count = await db.profileVideo.count({
    where: { profileId: profile.id, processing: { not: 'FAILED' } },
  });
  if (count >= limit) {
    return NextResponse.json({ error: 'video_limit', limit, tier }, { status: 409 });
  }

  // Тело идёт СЫРЫМ потоком, а не multipart (аудит 2026-08-01, P2).
  // req.formData() материализует файл в памяти целиком — для 200-МБ шоурила
  // это heap единственного контейнера. Здесь байты сразу утекают в хранилище;
  // название ролика едет отдельным заголовком, чтобы не заводить multipart.
  const mimeType = (req.headers.get('content-type') ?? '').split(';')[0].trim();
  const lengthRaw = req.headers.get('content-length');
  const sizeBytes = lengthRaw ? Number(lengthRaw) : NaN;

  if (!VIDEO_MIME_EXT[mimeType]) {
    return NextResponse.json({ error: 'unsupported_format' }, { status: 415 });
  }
  // Отклоняем ДО чтения тела: без Content-Length вес неизвестен, а принимать
  // поток неизвестного размера — приглашение залить диск.
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: 'validation' }, { status: 411 });
  }
  if (sizeBytes > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: 'file_too_large', limit: MAX_VIDEO_BYTES }, { status: 413 });
  }
  if (!req.body) return NextResponse.json({ error: 'validation' }, { status: 400 });

  // Заголовок ходит только по ASCII — название приезжает URL-кодированным
  const titleRaw = req.headers.get('x-video-title');
  let title: string | null = null;
  if (titleRaw) {
    try {
      title = decodeURIComponent(titleRaw).trim().slice(0, 120) || null;
    } catch {
      title = null; // битая кодировка — не повод отклонять загрузку целиком
    }
  }

  // Web-поток из fetch и node:stream/web типизированы порознь (разные lib),
  // хотя в рантайме Node это один и тот же объект — сужаем через unknown
  const stored = await storeVideoStream(
    Readable.fromWeb(req.body as unknown as NodeWebReadable<Uint8Array>),
    mimeType,
    sizeBytes,
  );
    // Повторная проверка ВНУТРИ транзакции: между ранней проверкой и вставкой
    // прошла заливка сотен мегабайт, и параллельные запросы все видели
    // «лимит не исчерпан» (у фотографий эта защита давно есть)
    const video = await db.$transaction(async (tx) => {
      const current = await tx.profileVideo.count({
        where: { profileId: profile.id, processing: { not: 'FAILED' } },
      });
      if (current >= limit) throw new VideoLimitError(limit);
      return tx.profileVideo.create({
      data: {
        profileId: profile.id,
        storageKey: stored.storageKey,
        mimeType,
        sizeBytes: stored.sizeBytes,
        title,
        sortOrder: count,
        // Автор уже прошёл модерацию профиля (в каталоге только APPROVED-профили),
        // видео — его самопрезентация → публикуем сразу. Поле status оставлено
        // для админ-тейкдауна при жалобе и для роликов, чьи кадры насторожили
        // премодерацию. Без модерации-тупика (PENDING навсегда).
        status: 'APPROVED',
        // Показывать ролик нечем, пока воркер не сделает web-варианты: исходник
        // наружу не отдаётся. UPLOADED — это позиция в очереди транскода.
        processing: 'UPLOADED',
        // Потолок длительности фиксируем на момент загрузки: если автор потом
        // сменит уровень, уже принятый ролик не должен задним числом стать
        // «слишком длинным».
        maxSeconds: videoSecondsLimit(tier),
      },
      });
    }).catch(async (e) => {
      // Лимит выбрали параллельные загрузки — убираем уже залитый файл, иначе
      // в хранилище остаётся объект, за который платим и который никому не
      // принадлежит (тот же приём, что у фотографий)
      if (e instanceof VideoLimitError) {
        await storage.delete(stored.storageKey).catch(() => {});
      }
      throw e;
    });
    return NextResponse.json(
      { videoId: video.id, uploaded: count + 1, limit, processing: 'UPLOADED' },
      { status: 201 },
    );
  });
}

// Удаление своего видео (+ чистка объекта в хранилище).
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const profile = await currentProfile(session.userId);
  if (!profile) return NextResponse.json({ error: 'no_profile' }, { status: 409 });

  const body = await req.json().catch(() => null);
  const videoId = typeof body?.videoId === 'string' ? body.videoId : null;
  if (!videoId) return NextResponse.json({ error: 'validation' }, { status: 400 });

  const video = await db.profileVideo.findUnique({ where: { id: videoId } });
  if (!video || video.profileId !== profile.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // Удаляем ВСЕ артефакты ролика, а не только исходник: после транскода в
  // бакете лежат ещё два варианта и постер, и они пережили бы удаление записи.
  for (const key of videoStorageKeys(video)) {
    await storage.delete(key).catch(() => {});
  }
  await db.profileVideo.delete({ where: { id: video.id } });
  return NextResponse.json({ ok: true });
}
