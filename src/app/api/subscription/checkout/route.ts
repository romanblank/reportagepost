import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/errors';
import { getSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { tinkoffConfigured, createPayment } from '@/lib/tinkoff';
import { prepareCheckout } from '@/lib/billing';
import { BASE_URL } from '@/lib/sitemap';
import { ru } from '@/i18n/ru';

// Инициация оплаты подписки через Т-Кассу. Без выданного терминала возвращаем
// not_configured — фронт откатывается на ручную заявку (/api/subscription/request).
export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    // Каждый вызов создаёт платёжную запись и обращение к эквайеру: цикл даёт
    // мусор в бухгалтерии и антифрод-претензии к платформе (аудит 2026-08-03)
    await rateLimit(`checkout:user:${session.userId}`, 10, 3600);
    if (session.role !== 'PHOTOGRAPHER') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const body = (await req.json().catch(() => null)) as { tier?: string } | null;
    const tier = body?.tier === 'ELITE' ? 'ELITE' : 'PRIME';

    if (!tinkoffConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

    const profile = await db.photographerProfile.findUnique({
      where: { userId: session.userId },
      select: { city: { select: { slug: true } }, user: { select: { email: true } } },
    });
    if (!profile) return NextResponse.json({ error: 'no_profile' }, { status: 409 });
    if (!profile.user.email) return NextResponse.json({ error: 'email_required' }, { status: 409 });

    const name = ru.pro.tierName[tier] ?? tier;
    const { orderId, amountMinor } = await prepareCheckout(session.userId, tier, profile.city.slug);
    try {
      const { paymentUrl } = await createPayment({
        amountMinor,
        orderId,
        description: ru.pro.paymentDescription(name),
        itemName: ru.pro.paymentItemName(name),
        successUrl: `${BASE_URL}/ru/cabinet?paid=1`,
        failUrl: `${BASE_URL}/ru/pro?failed=1`,
        notificationUrl: `${BASE_URL}/api/tinkoff/webhook`,
        email: profile.user.email,
      });
      return NextResponse.json({ paymentUrl });
    } catch (e) {
      console.error('[checkout] createPayment failed:', e);
      // Init не удался — не оставляем висящий Payment(NEW).
      await db.payment.update({ where: { orderId }, data: { status: 'REJECTED' } }).catch(() => {});
      return NextResponse.json({ error: 'payment_init_failed' }, { status: 502 });
    }
  });
}
