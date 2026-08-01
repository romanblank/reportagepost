import { NextResponse } from 'next/server';
import { z } from 'zod';
import { COOKIE_CONSENT_NAME, PDN_CONSENT_VERSION } from '@/lib/constants';
import { handleRoute, jsonError } from '@/lib/errors';

// Фиксация решения по cookie (аудит 2026-08-01, P2).
//
// Раньше согласие хранилось только в localStorage: доказать его наличие
// оператор не мог, то есть баннер существовал для вида — при том что РКН
// устойчиво трактует cookie вместе с IP как персональные данные.
//
// Пишем ОБЫЧНУЮ cookie (не httpOnly): её должен читать и клиент, чтобы не
// запускать необязательный трекинг. Значение несёт версию политики — при
// смене редакции согласие переспрашивается, а не наследуется молча.
const YEAR_SEC = 365 * 24 * 3600;

const Schema = z.object({ analytics: z.boolean() });

export function POST(req: Request) {
  return handleRoute(async () => {
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    const value = `${parsed.data.analytics ? 'all' : 'necessary'}:${PDN_CONSENT_VERSION}`;
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_CONSENT_NAME, value, {
      path: '/',
      maxAge: YEAR_SEC,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  });
}
