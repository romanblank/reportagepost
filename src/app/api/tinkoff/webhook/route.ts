import { verifyWebhookToken } from '@/lib/tinkoff';
import { applyPaymentStatus } from '@/lib/billing';

// Вебхук Т-Кассы (Notification). Проверяем Token (антиспуфинг), идемпотентно
// применяем статус, отвечаем строго "OK" (иначе Т-Касса будет ретраить).
// Провайдер за абстракцией: без пароля терминала не обрабатываем.
export async function POST(req: Request) {
  const password = process.env.TINKOFF_PASSWORD;
  if (!password) return new Response('OK'); // терминал не выдан — тихо принимаем

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !verifyWebhookToken(body, password)) {
    return new Response('forbidden', { status: 403 });
  }

  const orderId = typeof body.OrderId === 'string' ? body.OrderId : null;
  const tinkoffStatus = typeof body.Status === 'string' ? body.Status : '';
  const paymentId = body.PaymentId != null ? String(body.PaymentId) : null;

  // Маппинг статусов Т-Кассы → наши. Одностадийный захват ('O'): успех = CONFIRMED.
  const mapped =
    tinkoffStatus === 'CONFIRMED' || tinkoffStatus === 'AUTHORIZED' ? 'CONFIRMED'
    : tinkoffStatus === 'REJECTED' || tinkoffStatus === 'CANCELED' || tinkoffStatus === 'DEADLINE_EXPIRED' ? 'REJECTED'
    : tinkoffStatus === 'REFUNDED' || tinkoffStatus === 'PARTIAL_REFUNDED' ? 'REFUNDED'
    : null;

  // Промежуточные статусы (NEW/FORM_SHOWED/…) — просто подтверждаем приём.
  if (orderId && mapped) {
    await applyPaymentStatus(orderId, mapped, paymentId).catch((e) => {
      console.error('[tinkoff webhook] applyPaymentStatus failed:', orderId, e);
    });
  }

  return new Response('OK', { headers: { 'Content-Type': 'text/plain' } });
}
