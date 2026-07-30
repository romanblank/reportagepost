import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { storage } from '@/lib/storage';
import {
  VideoValidationError,
  storeVideo,
  VIDEO_LIMIT_PER_PROFILE,
  MAX_VIDEO_BYTES,
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

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const titleRaw = form?.get('title');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }
  // Отклоняем ПО РАЗМЕРУ ДО буферизации в память (DoS-guard: иначе 2+ ГБ
  // multipart полностью попадёт в heap до проверки веса).
  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  }
  const title = typeof titleRaw === 'string' ? titleRaw.trim().slice(0, 120) : null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeVideo(buffer, file.type);
    const video = await db.profileVideo.create({
      data: {
        profileId: profile.id,
        storageKey: stored.storageKey,
        mimeType: file.type,
        sizeBytes: stored.sizeBytes,
        title: title || null,
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
