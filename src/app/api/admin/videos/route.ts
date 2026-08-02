import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { handleRoute, jsonError } from '@/lib/errors';
import { approveVideo, rejectVideo } from '@/lib/moderation';

/**
 * Решение редакции по ролику, который премодерация отправила на проверку.
 *
 * Без этой ручки такой ролик оказывался в тупике: на странице его нет,
 * очереди для него нет, автор ждёт вечно — ровно то, что уже разбирали с
 * фотографиями.
 */
export function POST(req: Request) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);

    const body = await req.json().catch(() => null);
    const videoId = typeof body?.videoId === 'string' ? body.videoId : null;
    const action = body?.action === 'approve' || body?.action === 'reject' ? body.action : null;
    if (!videoId || !action) return jsonError('validation', 400);

    if (action === 'approve') {
      await approveVideo(videoId, admin.userId);
      return NextResponse.json({ ok: true });
    }

    const reason = typeof body?.reason === 'string' ? body.reason : '';
    await rejectVideo(videoId, reason, admin.userId);
    return NextResponse.json({ ok: true });
  });
}
