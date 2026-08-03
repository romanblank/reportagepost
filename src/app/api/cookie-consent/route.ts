import { NextResponse } from 'next/server';
import { z } from 'zod';
import { COOKIE_CONSENT_NAME, PDN_CONSENT_VERSION } from '@/lib/constants';
import { handleRoute, jsonError } from '@/lib/errors';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { clientIp } from '@/lib/rate-limit';

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

    const decision = parsed.data.analytics ? 'all' : 'necessary';

    // След на стороне оператора: cookie в браузере субъекта доказательством не
    // является — она стирается очисткой браузера, и предъявить нечего.
    // Адрес храним хешем: сам по себе он тоже персональные данные, а для сверки
    // достаточно совпадения. Запись не должна ронять сам ответ — решение
    // пользователя важнее, чем наша бухгалтерия по нему.
    const session = await getSession().catch(() => null);
    const ip = clientIp(req);
    void db.cookieConsent
      .create({
        data: {
          decision,
          policyVersion: PDN_CONSENT_VERSION,
          ipHash: ip ? createHash('sha256').update(`${ip}:${PDN_CONSENT_VERSION}`).digest('hex') : null,
          userId: session?.userId ?? null,
        },
      })
      .catch((e) => console.error('[consent] trail not written:', e));

    const value = `${decision}:${PDN_CONSENT_VERSION}`;
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
