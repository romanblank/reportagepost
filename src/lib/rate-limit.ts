import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';

// Rate-limit в PostgreSQL (аудит P1 #3): без Redis, атомарный upsert счётчика
// на фиксированное окно. Ключ = маршрут+идентификатор (IP или user/email).
// IP: приоритет x-real-ip (nginx выставляет из $remote_addr — не подделать), затем
// XFF-фолбэк. Defense-in-depth (аудит ядра 2026-07-31): если конфиг nginx когда-то
// сменят на append XFF, x-real-ip всё равно даст реальный адрес. Единообразно с
// profile-view. Текущий nginx перезаписывает и XFF, и X-Real-IP на $remote_addr.

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
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
