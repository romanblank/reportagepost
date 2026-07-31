import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { logAudit } from '@/lib/audit';
import { handleRoute, jsonError } from '@/lib/errors';

// Разбор жалобы админом. Решение фиксируется в AdminAudit — редакционные и
// trust-действия обязаны оставлять след (инвариант из прошлой аудит-волны).
const PatchSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  resolution: z.string().trim().max(500).optional(),
});

export function PATCH(req: Request, { params }: { params: Promise<{ reportId: string }> }) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);

    const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    const { reportId } = await params;
    const report = await db.report.findUnique({ where: { id: reportId }, select: { id: true, targetType: true, targetId: true } });
    if (!report) return jsonError('not_found', 404);

    await db.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: {
          status: parsed.data.status,
          resolution: parsed.data.resolution ?? null,
          resolvedById: admin.userId,
          resolvedAt: new Date(),
        },
      });
      await logAudit(tx, admin.userId, `report_${parsed.data.status.toLowerCase()}`, report.targetType, report.targetId, {
        reportId,
        resolution: parsed.data.resolution ?? null,
      });
    });

    return NextResponse.json({ ok: true });
  });
}
