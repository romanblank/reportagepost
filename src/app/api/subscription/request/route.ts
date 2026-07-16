import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { requestPro, isPro } from '@/lib/subscription';
import { notifyInApp } from '@/lib/notifications';
import { handleRoute, jsonError } from '@/lib/errors';

// Заявка фотографа на подключение PRO. Закрытая бета: реального checkout ещё нет
// (54-ФЗ чек — блокер оператора), оператор активирует founding-PRO вручную.
// Фиксируем заявку + уведомляем операторов (админов).
export function POST() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    if (session.role !== 'PHOTOGRAPHER') return jsonError('photographers_only', 403);
    if (await isPro(session.userId)) return NextResponse.json({ ok: true, alreadyPro: true });

    await requestPro(session.userId);

    // Уведомить операторов (in-app). Вторично — не роняем заявку.
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    const me = await db.user.findUnique({ where: { id: session.userId }, select: { firstName: true, lastName: true } });
    await Promise.all(
      admins.map((a) =>
        notifyInApp(a.id, 'notification.pro.requested', {
          userId: session.userId,
          name: me ? `${me.firstName} ${me.lastName}` : '',
        }),
      ),
    ).catch(() => {});

    return NextResponse.json({ ok: true });
  });
}
