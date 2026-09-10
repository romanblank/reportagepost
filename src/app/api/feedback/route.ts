import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { handleRoute, jsonError } from '@/lib/errors';
import { ru } from '@/i18n/ru';

const Schema = z.object({
  text: z.string().trim().min(10).max(2000),
  // Адрес страницы, с которой отправлено, — только свой путь
  page: z.string().trim().max(300).regex(/^\//),
});

// «Сообщить о проблеме» изнутри продукта (оценка 2026-09-10): фидбэк беты —
// её единственный продукт, а фидбэк, требующий выйти в почту, теряется.
// Оператору — телеграмом сразу; запись в БД — страховка и история.
export function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await getSession();
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    // Гости тоже могут (заказчик без аккаунта видит проблему не реже) — но
    // под жёстким лимитом: форма без входа = открытая дверь для спама
    await rateLimit(`feedback:ip:${clientIp(req)}`, 5, 3600);
    if (session) await rateLimit(`feedback:user:${session.userId}`, 10, 3600);

    const fb = await db.feedback.create({
      data: {
        userId: session?.userId ?? null,
        page: parsed.data.page,
        text: parsed.data.text,
      },
      select: { id: true, user: { select: { firstName: true, lastName: true } } },
    });

    // fire-and-forget: телеграм вторичен к записи
    const who = fb.user ? `${fb.user.firstName} ${fb.user.lastName}` : ru.feedbackForm.guestLabel;
    const { alertOperator } = await import('@/lib/telegram');
    void alertOperator(ru.operatorAlerts.feedback(who, parsed.data.page, parsed.data.text));

    return NextResponse.json({ ok: true });
  });
}
