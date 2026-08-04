import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { setThreadFlags } from '@/lib/forum';
import { handleRoute, jsonError } from '@/lib/errors';

/** Закрыть, открыть или закрепить тему. */
export function POST(req: Request) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);

    const body = await req.json().catch(() => null);
    const threadId = typeof body?.threadId === 'string' ? body.threadId : '';
    if (!threadId) return jsonError('validation', 400);

    const flags: { closed?: boolean; pinned?: boolean } = {};
    if (typeof body?.closed === 'boolean') flags.closed = body.closed;
    if (typeof body?.pinned === 'boolean') flags.pinned = body.pinned;
    if (Object.keys(flags).length === 0) return jsonError('validation', 400);

    await setThreadFlags(admin.userId, threadId, flags);
    return NextResponse.json({ ok: true });
  });
}
