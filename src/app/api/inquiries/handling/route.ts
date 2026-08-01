import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { setInquiryHandling } from '@/lib/inquiries';
import { handleRoute, jsonError } from '@/lib/errors';

// Личная отметка фотографа по заявке (аудит 2026-08-01, P2): «беру в работу»,
// «не берусь» или снятие отметки. Заявка веерная — отметка только своя.
const Schema = z.object({
  inquiryId: z.string().trim().min(1),
  state: z.enum(['IN_PROGRESS', 'DECLINED']).nullable(),
});

export function PATCH(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    if (session.role !== 'PHOTOGRAPHER') return jsonError('photographers_only', 403);

    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    await setInquiryHandling(session.userId, parsed.data.inquiryId, parsed.data.state);
    return NextResponse.json({ ok: true });
  });
}
