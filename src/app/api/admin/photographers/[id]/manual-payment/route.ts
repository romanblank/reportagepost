import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { recordManualPayment } from '@/lib/billing';
import { logAudit } from '@/lib/audit';
import { handleRoute, jsonError } from '@/lib/errors';

const Schema = z.object({
  tier: z.enum(['PRIME', 'ELITE']),
  // Сумма в РУБЛЯХ из формы админа; в минорные единицы переводим здесь
  amountRub: z.number().int().positive().max(1_000_000),
  // Основание: «перевод на счёт ИП 10.09», «счёт №3 оплачен» — журнал ручных
  // денег, без которого при подключении кассы историю не восстановить
  note: z.string().trim().min(3).max(300),
});

// Ручная фиксация оплаты, принятой ВНЕ платформы (перевод/счёт), пока касса
// не подключена. Создаёт Payment + зачисляет месяц тем же контуром, что
// вебхук Т-Кассы. Основание — в аудит-лог (оценка 2026-09-10, «деньги сегодня»).
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);
    const { id } = await ctx.params;
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    const profile = await db.photographerProfile.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!profile) return jsonError('not_found', 404);

    const { tier, amountRub, note } = parsed.data;
    const { orderId } = await recordManualPayment(profile.userId, tier, amountRub * 100);
    await logAudit(db, admin.userId, 'billing.manual_payment', 'USER', profile.userId, {
      profileId: id, tier, amountMinor: amountRub * 100, note, orderId,
    });

    return NextResponse.json({ ok: true, orderId, tier });
  });
}
