import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { handleRoute, jsonError } from '@/lib/errors';
import { processVideoQueue } from '@/lib/video-pipeline';

/**
 * Воркер транскода: разбирает очередь загруженных роликов.
 *
 * Живёт эндпоинтом, а не отдельным процессом, потому что на VM крутится один
 * контейнер — так у транскода те же переменные окружения, тот же доступ к базе
 * и хранилищу, и не нужен второй способ доставки секретов. Дёргает его cron с
 * машины (`rp-video.sh`), тем же bearer-секретом, что и плановое обслуживание.
 *
 * Ограничение параллельности держится размером партии: ffmpeg съедает ядро
 * целиком, и запустить их пачкой — значит положить сайт ради чужого шоурила.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 800;

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

    const startedAt = Date.now();
    const results = await processVideoQueue();
    return NextResponse.json({
      ok: true,
      processed: results.length,
      failed: results.filter((r) => !r.ok).length,
      tookMs: Date.now() - startedAt,
    });
  });
}
