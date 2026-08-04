import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { handleRoute, jsonError, DomainError } from '@/lib/errors';
import { requestShootConfirmation } from '@/lib/shoots';

const schema = z.object({
  clientUserId: z.string().min(1),
  eventDate: z.string().date().optional(),
});

/**
 * Фотограф отмечает съёмку с заказчиком.
 *
 * Основной путь подтверждения (переворот 2026-08-04): раньше отмечал заказчик,
 * у которого после закрытой сделки нет причин возвращаться на платформу, —
 * и механика оставалась пустой. Теперь инициирует тот, кому это нужно, а
 * заказчику остаётся одно действие.
 */
export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    if (session.role !== 'PHOTOGRAPHER') return jsonError('forbidden', 403);

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError('validation', 400);

    const eventDate = parsed.data.eventDate ? new Date(`${parsed.data.eventDate}T00:00:00Z`) : undefined;
    await requestShootConfirmation(session.userId, parsed.data.clientUserId, eventDate);
    return NextResponse.json({ ok: true }, { status: 201 });
  });
}
