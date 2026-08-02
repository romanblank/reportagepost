import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/errors';
import { z } from 'zod';
import { getSession, verifyPassword, SESSION_COOKIE } from '@/lib/auth';
import { db } from '@/lib/db';
import { deleteAccount } from '@/lib/account';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({ password: z.string().min(1) });

// Удаление своего аккаунта (ПнД). Подтверждение паролем — действие необратимо.
export function DELETE(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Проверка пароля — argon2id на 19 МБ памяти и ядро. Без лимита сотня
  // параллельных запросов с мусорным паролем кладёт весь контейнер (аудит
  // 2026-08-03); у соседней ручки настроек лимит уже стоял.
  await rateLimit(`account-delete:user:${session.userId}`, 5, 3600);

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'validation' }, { status: 400 });

    const user = await db.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
    // Есть пароль — подтверждаем им. Без пароля (будущий OTP-вход) достаточно
    // авторизованной сессии — иначе право на удаление данных (ПнД) недоступно.
    if (user?.passwordHash && !(await verifyPassword(user.passwordHash, parsed.data.password))) {
      return NextResponse.json({ error: 'wrong_password' }, { status: 403 });
    }

    await deleteAccount(session.userId);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 }); // сессия мертва
    return res;
  });
}
