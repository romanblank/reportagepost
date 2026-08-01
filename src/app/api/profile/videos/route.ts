import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadable } from 'node:stream/web';
import {
  VideoValidationError,
  storeVideoStream,
  VIDEO_LIMIT_PER_PROFILE,
  MAX_VIDEO_BYTES,
  VIDEO_MIME_EXT,
} from '@/lib/videos';

export const maxDuration = 60; // крупная загрузка

async function currentProfile(userId: string) {
  return db.photographerProfile.findUnique({ where: { userId }, select: { id: true } });
}

// Загрузка видео автора (multipart: file, title?). Публикация после модерации (как фото).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const profile = await currentProfile(session.userId);
  if (!profile) return NextResponse.json({ error: 'no_profile' }, { status: 409 });

  const count = await db.profileVideo.count({ where: { profileId: profile.id } });
  if (count >= VIDEO_LIMIT_PER_PROFILE) {
    return NextResponse.json({ error: 'video_limit', limit: VIDEO_LIMIT_PER_PROFILE }, { status: 409 });
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

  try {
    const stored = await storeVideoStream(// Web-поток из fetch и node:stream/web типизированы порознь (разные lib),
    // хотя в рантайме Node это один и тот же объект — сужаем через unknown
    Readable.fromWeb(req.body as unknown as NodeWebReadable<Uint8Array>), mimeType, sizeBytes);
    const video = await db.profileVideo.create({
      data: {
        profileId: profile.id,
        storageKey: stored.storageKey,
        mimeType,
        sizeBytes: stored.sizeBytes,
        title,
        sortOrder: count,
        // Автор уже прошёл модерацию профиля (в каталоге только APPROVED-профили),
        // видео — его самопрезентация → публикуем сразу. Поле status оставлено
        // для админ-тейкдауна при жалобе. Без модерации-тупика (PENDING навсегда).
        status: 'APPROVED',
      },
    });
    return NextResponse.json({ videoId: video.id, uploaded: count + 1, limit: VIDEO_LIMIT_PER_PROFILE }, { status: 201 });
  } catch (e) {
    if (e instanceof VideoValidationError) {
      const status = e.code === 'file_too_large' ? 413 : 422;
      return NextResponse.json({ error: e.code }, { status });
    }
    throw e;
  }
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
  await storage.delete(video.storageKey);
  await db.profileVideo.delete({ where: { id: video.id } });
  return NextResponse.json({ ok: true });
}
