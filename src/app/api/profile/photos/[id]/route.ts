import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { deletePhoto } from '@/lib/portfolio';
import { handleRoute, jsonError } from '@/lib/errors';

// Удаление фото из портфолио (владелец). Чистит варианты в хранилище.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const { id } = await ctx.params;
    await deletePhoto(session.userId, id);
    return NextResponse.json({ ok: true });
  });
}
