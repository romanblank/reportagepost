import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { startJobRun, finishJobRun } from '@/lib/job-run';
import { JOB_THRESHOLDS } from '@/lib/job-thresholds';
import { handleRoute, jsonError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * Отметка о прогоне задачи, которая выполняется НЕ внутри приложения.
 *
 * Бэкап делает GitHub Actions на своей стороне, поэтому платформа о нём не
 * знала ничего: пять успешных прогонов подряд, а `/health` показывал «никогда
 * не запускался». Такая ложная тревога хуже отсутствия мониторинга — реальная
 * поломка не изменила бы показатель, он и так в худшем состоянии.
 */
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

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name : '';
    // Только известные задачи: чужое имя создало бы запись, которую никто
    // никогда не проверяет, и мониторинг снова начал бы врать
    if (!(name in JOB_THRESHOLDS)) return jsonError('unknown_job', 400);

    const ok = body?.ok !== false;
    const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : undefined;

    const runId = await startJobRun(name);
    await finishJobRun(runId, ok, note);

    return NextResponse.json({ ok: true, name });
  });
}
