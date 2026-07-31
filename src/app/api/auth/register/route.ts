import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { consumeInviteCode, releaseInviteCode } from '@/lib/invites';
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
  sessionCookieOptions,
} from '@/lib/auth';
import { OPEN_REGISTRATION, PDN_CONSENT_VERSION } from '@/lib/constants';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { requestEmailVerification } from '@/lib/email-verification';

// Валидация на границе (правило: данным извне не верить)
const RegisterSchema = z.object({
  role: z.enum(['PHOTOGRAPHER', 'CLIENT']),
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(200),
  inviteCode: z.string().trim().optional(),
  // Согласие на обработку ПДн (152-ФЗ) — обязательно при открытом сборе данных
  pdnConsent: z.literal(true),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const data = parsed.data;

  try {
    await rateLimit(`register:ip:${clientIp(req)}`, 10, 3600);
  } catch {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  // Гейт регистрации. Открытая регистрация (OPEN_REGISTRATION) — инвайт
  // опционален (реферальная атрибуция, если код есть). Закрытая — код обязателен.
  // noindex завязан на PUBLIC_LAUNCH и здесь не затрагивается (ребрендинг 2026-07).
  // Занятый email проверяем ДО потребления инвайта (аудит 2026-07-31, P0):
  // раньше код сгорал, а регистрация отклонялась — приглашённый оставался ни с чем.
  const existingEmail = await db.user.findUnique({ where: { email: data.email } });
  if (existingEmail) {
    return NextResponse.json({ error: 'email_taken' }, { status: 409 });
  }

  let inviteCodeId: string | null = null;
  if (!OPEN_REGISTRATION) {
    if (!data.inviteCode) {
      return NextResponse.json({ error: 'invite_required' }, { status: 403 });
    }
    inviteCodeId = await consumeInviteCode(data.inviteCode);
    if (!inviteCodeId) {
      return NextResponse.json({ error: 'invite_invalid' }, { status: 403 });
    }
  } else if (data.inviteCode) {
    // Открыто, но код передан — засчитываем атрибуцию (best-effort, не блокируем)
    inviteCodeId = await consumeInviteCode(data.inviteCode);
  }

  let user;
  try {
    user = await db.user.create({
      data: {
        role: data.role,
        // Заказчику модерация не нужна — активен сразу; фотограф ждёт портфолио
        status: data.role === 'CLIENT' ? 'ACTIVE' : 'PENDING',
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        inviteCodeId,
        pdnConsentAt: new Date(),
        pdnConsentVersion: PDN_CONSENT_VERSION,
      },
    });
  } catch (e) {
    // Гонка: между проверкой и вставкой email заняли. Инвайт уже списан —
    // возвращаем его в оборот, иначе приглашение пропадает впустую (аудит P0).
    if (inviteCodeId) await releaseInviteCode(inviteCodeId);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'email_taken' }, { status: 409 });
    }
    throw e;
  }

  // Письмо с подтверждением адреса (аудит P0). Не блокируем ответ: без SMTP
  // это no-op, а сбой почты не должен ронять успешную регистрацию.
  void requestEmailVerification(user.id).catch(() => {});

  const token = await createSessionToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });
  const res = NextResponse.json(
    { userId: user.id, role: user.role, status: user.status },
    { status: 201 },
  );
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
