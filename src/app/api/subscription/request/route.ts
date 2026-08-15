import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { requestSubscription, isSubscriber } from '@/lib/subscription';
import { notifyInApp } from '@/lib/notifications';
import { handleRoute, jsonError } from '@/lib/errors';

// Заявка фотографа на подключение PRO. Закрытая бета: реального checkout ещё нет
// (54-ФЗ чек — блокер оператора), оператор активирует founding-PRO вручную.
// Фиксируем заявку + уведомляем операторов (админов).
const bodySchema = z.object({ tier: z.enum(['PRIME', 'ELITE']).default('PRIME') });

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    if (session.role !== 'PHOTOGRAPHER') return jsonError('photographers_only', 403);
    if (await isSubscriber(session.userId)) return NextResponse.json({ ok: true, alreadyPro: true });

    // Тело опционально (пустой POST = Prime): заявка без уровня заставляла
    // оператора угадывать, какой тариф активировать
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw ?? {});
    const tier = parsed.success ? parsed.data.tier : 'PRIME';

    await requestSubscription(session.userId, tier);

    // Уведомить операторов (in-app). Вторично — не роняем заявку.
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    const me = await db.user.findUnique({ where: { id: session.userId }, select: { firstName: true, lastName: true } });
    await Promise.all(
      admins.map((a) =>
        notifyInApp(a.id, 'notification.pro.requested', {
          userId: session.userId,
          name: me ? `${me.firstName} ${me.lastName}` : '',
          tier,
        }),
      ),
    ).catch(() => {});

    return NextResponse.json({ ok: true });
  });
}
