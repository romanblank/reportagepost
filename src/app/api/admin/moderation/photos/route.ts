import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/errors';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { approvePhoto, photoModerationQueue, rejectPhoto } from '@/lib/moderation';

// Пофотовая модерация (аудит 2026-07-31, P0): кадры, добавленные ПОСЛЕ одобрения
// профиля, оставались PENDING навсегда — инструмента, который бы их показывал,
// не существовало вовсе.

export function GET() {
  return handleRoute(async () => {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.json({ queue: await photoModerationQueue() });
  });
}

// Массовое решение — не удобство, а условие работы: автор публикует съёмку
// пачкой, и одобрять сорок кадров по одному значит не одобрять их вовсе.
// Отказ пачкой тоже возможен, но причина остаётся обязательной: она доходит до
// автора, и «нет» без объяснения не отличается от произвола.
const DecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), photoId: z.string().optional(), photoIds: z.array(z.string()).max(200).optional() }),
  z.object({
    action: z.literal('reject'),
    photoId: z.string().optional(),
    photoIds: z.array(z.string()).max(200).optional(),
    reason: z.string().trim().min(5).max(1000), // причина обязательна — доходит до автора
  }),
]);

export function POST(req: Request) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const parsed = DecisionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const ids = parsed.data.photoIds?.length
      ? parsed.data.photoIds
      : parsed.data.photoId
        ? [parsed.data.photoId]
        : [];
    if (ids.length === 0) return NextResponse.json({ error: 'validation' }, { status: 400 });

    // Каждый кадр решается отдельно: один упавший (например, уже удалённый
    // автором) не должен отменять решение по остальным сорока
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const applied =
          parsed.data.action === 'approve'
            ? await approvePhoto(id, admin.userId)
            : await rejectPhoto(id, parsed.data.reason, admin.userId);
        // «Ничего не изменилось» — тоже неуспех: кадр мог быть удалён автором
        // или уже решён в другой вкладке
        if (!applied) failed.push(id);
      } catch {
        failed.push(id);
      }
    }

    return NextResponse.json({
      ok: failed.length === 0,
      action: parsed.data.action,
      done: ids.length - failed.length,
      failed,
    });
  });
}
