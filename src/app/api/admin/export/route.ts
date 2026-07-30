import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { handleRoute, jsonError } from '@/lib/errors';
import { photographerExportCsv } from '@/lib/admin-export';

// Выгрузка агрегируемых знаний платформы (B2B-актив) — только админ, персоналки
// в файле нет (см. admin-export.ts). Выгрузка — чувствительное действие → аудит-след.
export function GET() {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);

    const csv = await photographerExportCsv();
    await logAudit(db, admin.userId, 'data.export', 'PROFILE', 'photographers', { format: 'csv' });

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="photographers-export.csv"',
        'Cache-Control': 'no-store',
      },
    });
  });
}
