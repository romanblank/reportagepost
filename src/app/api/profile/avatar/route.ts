import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { processAndStoreAvatar, PhotoValidationError } from '@/lib/photos';

export const maxDuration = 30;
const MAX_BYTES = 10 * 1024 * 1024;

// Загрузка аватара фотографа (multipart: file). Квадрат 400×400.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'PHOTOGRAPHER') return NextResponse.json({ error: 'photographers_only' }, { status: 403 });

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
}
