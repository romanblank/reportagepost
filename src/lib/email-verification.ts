import { randomBytes, createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { sendEmail, emailConfigured } from '@/lib/email';
import { APP_DOMAIN } from '@/lib/constants';
import { ru } from '@/i18n/ru';
import { DomainError } from '@/lib/errors';

// Подтверждение email (аудит 2026-07-31, P0). Зачем:
// 1) опечатка в адресе при регистрации навсегда убивала аккаунт — восстановление
//    пароля уходило в несуществующий ящик, войти было нельзя;
// 2) чужой адрес можно было занять (сквоттинг): бот регистрирует почты реальных
//    фотографов, и когда амбассадор их зовёт, они получают «email занят»;
// 3) неподтверждённые аккаунты — топливо для накрутки и спама в личку.
//
// ГЕЙТ ВКЛЮЧАЕТСЯ САМ, когда появится SMTP (Postbox у оператора ещё не заведён):
// без почты требовать подтверждение нельзя — люди просто не смогут пользоваться
// платформой. См. verificationRequired().

const TTL_HOURS = 48;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Требуется ли подтверждение адреса для действий (личка, отзывы).
 *
 * Без SMTP — нет: гейт без возможности подтвердиться это тупик.
 *
 * Рубильник `EMAIL_GATE=off` нужен для случая, когда почта НАСТРОЕНА, но не
 * работает (провайдер отвергает отправку, домен не подтверждён, песочница).
 * Тогда конфигурация есть, письма не доходят, и гейт молча запирает всех
 * новых пользователей — ровно то состояние, в котором платформа оказалась
 * 2026-08-03 с ошибкой SMTP «credentials invalid». Проверить положение
 * рубильника можно на /ru/admin/mail.
 */
export function verificationRequired(): boolean {
  if (process.env.EMAIL_GATE === 'off') return false;
  return emailConfigured();
}

/**
 * Выдать токен и отправить письмо.
 *
 * Прежние токены НЕ гасим. Раньше гасили — и это ломало ровно тот сценарий,
 * ради которого кнопка существует: человек не находит первое письмо, жмёт
 * «отправить ещё раз», потом всё-таки открывает первое — и получает «ссылка
 * недействительна». Токен одноразовый и живёт двое суток, поэтому несколько
 * действующих ссылок опасности не создают, а спасают от типичной путаницы.
 */
export async function requestEmailVerification(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!user?.email || user.emailVerifiedAt) return; // нечего подтверждать
  if (!emailConfigured()) return; // no-op без почты — письмо всё равно не уйдёт

  const raw = randomBytes(32).toString('base64url');
  await db.$transaction([
    db.emailVerification.create({
      data: {
        userId,
        email: user.email,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + TTL_HOURS * 3_600_000),
      },
    }),
  ]);
  const link = `https://${APP_DOMAIN}/ru/verify-email?token=${raw}`;
  await sendEmail(user.email, ru.auth.emailVerify.subject, ru.auth.emailVerify.body(link, TTL_HOURS));
}

/** Подтвердить адрес по токену. Возвращает id пользователя. */
export type ConfirmOutcome = 'confirmed' | 'already';

export async function confirmEmail(token: string): Promise<{ userId: string; outcome: ConfirmOutcome }> {
  const hash = sha256(token);

  // Уже сработавшая ссылка — не ошибка. Почтовые антивирусы открывают ссылки
  // за человека, и он, перейдя следом, видел «ссылка недействительна» при
  // подтверждённом адресе: сообщение прямо противоречило реальности
  const used = await db.emailVerification.findFirst({
    where: { tokenHash: hash, usedAt: { not: null } },
    select: { userId: true },
  });
  if (used) {
    const u = await db.user.findUnique({ where: { id: used.userId }, select: { emailVerifiedAt: true } });
    if (u?.emailVerifiedAt) return { userId: used.userId, outcome: 'already' };
  }

  const row = await db.emailVerification.findFirst({
    where: { tokenHash: hash, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userId: true, email: true },
  });
  if (!row) throw new DomainError('verification_invalid', 400);

  // Адрес мог смениться после выдачи токена — тогда подтверждать нечего
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { email: true } });
  if (!user || user.email !== row.email) throw new DomainError('verification_invalid', 400);

  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
    // Гасим все живые токены этого адреса: подтверждать больше нечего
    db.emailVerification.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  return { userId: row.userId, outcome: 'confirmed' };
}

/**
 * Гейт действий, требующих подтверждённого адреса (личка, отзывы, раскрытие
 * телефонов). Пока SMTP не настроен — пропускает всех, чтобы платформа
 * оставалась работоспособной; при появлении почты начинает требовать.
 */
export async function assertEmailVerified(userId: string): Promise<void> {
  if (!verificationRequired()) return;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true, role: true },
  });
  if (!user) throw new DomainError('unauthorized', 401);
  if (user.role === 'ADMIN') return; // админ не блокируется собственным гейтом
  if (!user.emailVerifiedAt) throw new DomainError('email_not_verified', 403);
}
