import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { toggleSavePhoto } from '@/lib/feeds';
import { rateLimit } from '@/lib/rate-limit';
import { handleRoute, jsonError } from '@/lib/errors';

// Личная закладка кадра (вкладка «Сохранённые» фотоленты). Не лайк:
// на рейтинг не влияет, видна только владельцу. Переключатель — как лайк.
export function POST(_req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const { photoId } = await params;

    await rateLimit(`photo-save:user:${session.userId}`, 60, 3600);
    const { saved } = await toggleSavePhoto(session.userId, photoId);
    return NextResponse.json({ ok: true, saved });
  });
}
