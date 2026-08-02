import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { handleRoute, jsonError } from '@/lib/errors';
import { emailConfigured, verifyMailTransport, sendEmailStrict } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { ru } from '@/i18n/ru';

/**
 * Проверка почты из админки.
 *
 * «Письмо не приходит» распадается на три разных случая, и снаружи они
 * неразличимы: SMTP не настроен, SMTP отвергает отправку (аутентификация,
 * неподтверждённый домен, песочница провайдера), письмо ушло и осело в спаме.
 * Разбирательство каждый раз начиналось с гадания — здесь оно занимает
 * секунды: соединение проверяется отдельно от отправки, а ошибка SMTP
 * показывается как есть, без перевода в вежливое «что-то пошло не так».
 *
 * Письмо уходит на адрес самого администратора: разослать что-либо чужим
 * людям этой ручкой нельзя.
 */
export function POST() {
  return handleRoute(async () => {
    if (!(await requireAdmin())) return jsonError('forbidden', 403);
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    // Отправка через провайдера стоит денег и квоты — не даём кликать без счёта
    await rateLimit(`mail-test:user:${session.userId}`, 10, 3600);

    if (!emailConfigured()) {
      return NextResponse.json({ ok: false, stage: 'config', error: ru.adminMail.notConfigured });
    }

    const me = await db.user.findUnique({ where: { id: session.userId }, select: { email: true } });
    if (!me?.email) return jsonError('validation', 400);

    // Стадия 1: соединение и аутентификация — отделяем «сервер не пускает»
    // от «сервер принял письмо, но получатель его не увидел»
    const connection = await verifyMailTransport();
    if (!connection.ok) {
      return NextResponse.json({ ok: false, stage: 'connect', error: connection.error, to: me.email });
    }

    // Стадия 2: настоящая отправка себе
    const sent = await sendEmailStrict(
      me.email,
      ru.adminMail.testSubject,
      ru.adminMail.testBody,
      'transactional',
    );
    if (!sent.ok) {
      return NextResponse.json({ ok: false, stage: 'send', error: sent.error, to: me.email });
    }

    return NextResponse.json({ ok: true, to: me.email });
  });
}
