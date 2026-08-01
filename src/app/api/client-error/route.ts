import { NextResponse } from 'next/server';
import { z } from 'zod';
import { reportError } from '@/lib/error-report';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { DomainError, handleRoute } from '@/lib/errors';

// Приём клиентских ошибок из error-boundary (аудит 2026-07-31, P1).
// Ошибка рендера у пользователя иначе видна только в его собственной консоли —
// то есть никому. Дедуп и антиспам — внутри reportError и здесь по IP.
const Schema = z.object({
  digest: z.string().trim().max(64).optional(),
  message: z.string().trim().max(500),
  path: z.string().trim().max(300).optional(),
});

export function POST(req: Request) {
  return handleRoute(async () => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    // Жёсткий лимит: эндпоинт публичный, писать в Telegram по запросу извне нельзя
    await rateLimit(`client-error:${clientIp(req)}`, 10, 3600);
  } catch (e) {
    // Лимит гасим молча (клиенту незачем знать), но падение БД не прячем —
    // прежний пустой catch делал их неотличимыми (аудит 2026-08-01, P2).
    if (e instanceof DomainError && e.code === 'rate_limited') {
      return NextResponse.json({ ok: true });
    }
    throw e;
  }

  await reportError(
    `client${parsed.data.path ? ` ${parsed.data.path}` : ''}`,
    new Error(parsed.data.message),
    parsed.data.digest ? `digest ${parsed.data.digest}` : undefined,
  );
  return NextResponse.json({ ok: true });
  });
}
