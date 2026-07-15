import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resetPassword } from '@/lib/password-reset';
import { handleRoute, jsonError } from '@/lib/errors';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const Schema = z.object({ token: z.string().min(10), password: z.string().min(10).max(200) });

export async function POST(req: Request) {
  return handleRoute(async () => {
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);
    try {
      await rateLimit(`pwreset-confirm:ip:${clientIp(req)}`, 10, 3600);
    } catch {
      return jsonError('rate_limited', 429);
    }
    await resetPassword(parsed.data.token, parsed.data.password);
    return NextResponse.json({ ok: true });
  });
}
