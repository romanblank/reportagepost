import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { handleRoute, jsonError } from '@/lib/errors';
import { releaseInquiries } from '@/lib/inquiries';
import { ru } from '@/i18n/ru';

/**
 * Волны доставки заявок.
 *
 * Фора подписчиков измеряется часами, поэтому задача ходит каждые пятнадцать
 * минут — в плановом обслуживании раз в сутки она бы означала, что «фора в два
 * часа» на деле растягивается на сутки, и перк не работает.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function POST(req: Request) {
  return handleRoute(async () => {
    if (!authorized(req)) return jsonError('forbidden', 403);

    const { startJobRun, finishJobRun } = await import('@/lib/job-run');
    const runId = await startJobRun('inquiries');
    const delivered = await releaseInquiries();
    await finishJobRun(runId, true, ru.operatorAlerts.inquiriesNote(delivered));

    return NextResponse.json({ ok: true, delivered });
  });
}
