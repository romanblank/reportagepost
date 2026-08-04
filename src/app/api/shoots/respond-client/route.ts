import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { handleRoute, jsonError, DomainError } from '@/lib/errors';
import { respondToShootRequest } from '@/lib/shoots';

const schema = z.object({ shootId: z.string().min(1), accept: z.boolean() });

/** Ответ заказчика на отметку фотографа: «да, снимали» или «нет». */
export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError('validation', 400);

    await respondToShootRequest(session.userId, parsed.data.shootId, parsed.data.accept);
    return NextResponse.json({ ok: true });
  });
}
