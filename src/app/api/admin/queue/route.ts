import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { decideArticle } from '@/lib/articles';
import { decideForumItem, decideComment } from '@/lib/moderation-queue';
import { handleRoute, jsonError } from '@/lib/errors';

/** Решения по очереди: статьи, спорные сообщения форума и комментарии. */
export function POST(req: Request) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);

    const b = await req.json().catch(() => null);
    const kind = typeof b?.kind === 'string' ? b.kind : '';
    const id = typeof b?.id === 'string' ? b.id : '';
    const publish = b?.publish === true;
    const reason = typeof b?.reason === 'string' ? b.reason : 'off_topic';
    if (!id) return jsonError('validation', 400);

    if (kind === 'article') {
      await decideArticle(admin.userId, id, publish ? { publish: true } : { publish: false, reason });
    } else if (kind === 'post' || kind === 'thread') {
      await decideForumItem(admin.userId, kind, id, publish, reason);
    } else if (kind === 'comment') {
      await decideComment(admin.userId, id, publish);
    } else {
      return jsonError('validation', 400);
    }
    return NextResponse.json({ ok: true });
  });
}
