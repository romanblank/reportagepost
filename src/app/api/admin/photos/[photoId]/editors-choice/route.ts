import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { toggleEditorsChoice } from '@/lib/feeds';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { handleRoute, jsonError } from '@/lib/errors';

export function POST(_req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);
    const { photoId } = await params;
    const res = await toggleEditorsChoice(photoId);
    // Аудит-след редакционного решения (аудит 2026-07-28).
    await logAudit(db, admin.userId, res.chosen ? 'photo.editors_choice_on' : 'photo.editors_choice_off', 'PHOTO', photoId, {});
    return NextResponse.json(res);
  });
}
