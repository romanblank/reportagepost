import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requestPasswordReset } from '@/lib/password-reset';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { DomainError, handleRoute } from '@/lib/errors';

const Schema = z.object({ email: z.string().trim().toLowerCase().email() });

// Запрос ссылки сброса. Всегда 200 (не палим существование email).
export function POST(req: Request) {
  return handleRoute(async () => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true }); // тихо

  // Ответ 200 при лимите — намеренно: иначе по коду ответа можно перебирать,
  // какие адреса зарегистрированы. Но ловим ИМЕННО лимит (аудит 2026-08-01,
  // P2): прежний пустой catch глотал и падение БД, превращая инцидент в
  // «письмо отправлено», хотя не отправлялось ничего.
  try {
    await rateLimit(`pwreset:ip:${clientIp(req)}`, 5, 3600);
    await rateLimit(`pwreset:email:${parsed.data.email}`, 3, 3600);
  } catch (e) {
    if (e instanceof DomainError && e.code === 'rate_limited') {
      return NextResponse.json({ ok: true });
    }
    throw e;
  }

  await requestPasswordReset(parsed.data.email).catch((e) => {
    console.error('[password-reset] request failed:', e);
  });
  return NextResponse.json({ ok: true });
  });
}
