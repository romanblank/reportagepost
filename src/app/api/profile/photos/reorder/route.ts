import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { reorderPhotos } from '@/lib/portfolio';
import { handleRoute, jsonError } from '@/lib/errors';

const Schema = z.object({ ids: z.array(z.string()).min(1).max(500) });

// Пересортировка портфолио (владелец): порядок = позиция в массиве ids.
export async function PATCH(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);
    await reorderPhotos(session.userId, parsed.data.ids);
    return NextResponse.json({ ok: true });
  });
}
