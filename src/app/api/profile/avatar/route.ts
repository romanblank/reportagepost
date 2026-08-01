import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/errors';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { processAndStoreAvatar, PhotoValidationError } from '@/lib/photos';
import { rateLimit } from '@/lib/rate-limit';

export const maxDuration = 30;
const MAX_BYTES = 10 * 1024 * 1024;

// Загрузка аватара фотографа (multipart: file). Квадрат 400×400.
export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (session.role !== 'PHOTOGRAPHER') return NextResponse.json({ error: 'photographers_only' }, { status: 403 });

    // Ранний отказ по Content-Length ДО буферизации тела (ревью №7: DoS памятью)
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) return NextResponse.json({ error: 'file_too_large' }, { status: 413 });

    // Лимит частоты (ревью №7: sharp-обработка — CPU; без лимита — DoS).
    // 429 отдаёт handleRoute по DomainError; прежний catch ловил и падение БД
    // (аудит 2026-08-01, P2).
    await rateLimit(`avatar:user:${session.userId}`, 10, 3600);

    const profile = await db.photographerProfile.findUnique({ where: { userId: session.userId }, select: { id: true } });
    if (!profile) return NextResponse.json({ error: 'no_profile' }, { status: 404 });

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'validation' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'file_too_large' }, { status: 413 });

    try {
      const key = await processAndStoreAvatar(Buffer.from(await file.arrayBuffer()), profile.id);
      await db.photographerProfile.update({ where: { id: profile.id }, data: { avatarKey: key } });
      return NextResponse.json({ ok: true });
    } catch (e) {
      if (e instanceof PhotoValidationError) return NextResponse.json({ error: e.code }, { status: 422 });
      throw e;
    }
  });
}
