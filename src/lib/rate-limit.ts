import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';

// Rate-limit в PostgreSQL (аудит P1 #3): без Redis, атомарный upsert счётчика
// на фиксированное окно. Ключ = маршрут+идентификатор (IP или user/email).
// IP берём из X-Forwarded-For, который nginx перезаписывает реальным адресом.

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  return xff.split(',')[0]?.trim() || 'unknown';
}

/**
 * Бросает DomainError('rate_limited', 429) при превышении.
 * windowSec — длина окна; max — сколько запросов на ключ за окно.
 */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<void> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSec * 1000)) * windowSec * 1000);

  const row = await db.rateLimit.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (row.count > max) throw new DomainError('rate_limited', 429);
}
