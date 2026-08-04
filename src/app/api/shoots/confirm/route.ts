import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { handleRoute, jsonError, DomainError } from '@/lib/errors';
import { confirmShoot } from '@/lib/shoots';

const schema = z.object({
  profileId: z.string().min(1),
  // Дата съёмки: без неё повторная работа с тем же заказчиком отсекалась как
  // дубль, и публичный факт «возвращаются» оставался нулём у всех авторов.
  eventDate: z.string().date().optional(),
});

// Заказчик подтверждает состоявшуюся съёмку с автором (честный якорь доверия).
export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError('validation', 400);
    const eventDate = parsed.data.eventDate ? new Date(`${parsed.data.eventDate}T00:00:00Z`) : undefined;
    await confirmShoot(session.userId, parsed.data.profileId, eventDate);
    return NextResponse.json({ ok: true }, { status: 201 });
  });
}
