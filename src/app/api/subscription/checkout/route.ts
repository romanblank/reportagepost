import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { tinkoffConfigured, createPayment } from '@/lib/tinkoff';
import { prepareCheckout } from '@/lib/billing';
import { BASE_URL } from '@/lib/sitemap';
import { ru } from '@/i18n/ru';

// Инициация оплаты подписки через Т-Кассу. Без выданного терминала возвращаем
// not_configured — фронт откатывается на ручную заявку (/api/subscription/request).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
      description: `Подписка ${name}`,
      itemName: `Подписка ${name} — доступ на 1 месяц`,
      successUrl: `${BASE_URL}/ru/cabinet?paid=1`,
      failUrl: `${BASE_URL}/ru/pro?failed=1`,
      notificationUrl: `${BASE_URL}/api/tinkoff/webhook`,
      email: profile.user.email,
    });
    return NextResponse.json({ paymentUrl });
  } catch (e) {
    console.error('[checkout] createPayment failed:', e);
    return NextResponse.json({ error: 'payment_init_failed' }, { status: 502 });
  }
}
