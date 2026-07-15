import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requestPasswordReset } from '@/lib/password-reset';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const Schema = z.object({ email: z.string().trim().toLowerCase().email() });

// Запрос ссылки сброса. Всегда 200 (не палим существование email).
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true }); // тихо

  try {
    await rateLimit(`pwreset:ip:${clientIp(req)}`, 5, 3600);
    await rateLimit(`pwreset:email:${parsed.data.email}`, 3, 3600);
  } catch {
    return NextResponse.json({ ok: true }); // не раскрываем rate-limit по email
  }

  await requestPasswordReset(parsed.data.email).catch((e) => {
    console.error('[password-reset] request failed:', e);
  });
  return NextResponse.json({ ok: true });
}
