import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { setCover } from '@/lib/portfolio';
import { handleRoute, jsonError } from '@/lib/errors';

const Schema = z.object({ photoId: z.string() });

// Выбор обложки каталога (владелец): только своё APPROVED-фото.
export async function PATCH(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);
    await setCover(session.userId, parsed.data.photoId);
    return NextResponse.json({ ok: true });
  });
}
