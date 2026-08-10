import nodemailer, { type Transporter } from 'nodemailer';
import { ru } from '@/i18n/ru';
import { alertOperator } from '@/lib/telegram';
import { BASE_URL } from '@/lib/sitemap';
import { MAIL_FROM_DEFAULT } from '@/lib/constants';
import { operatorLine } from '@/lib/legal-entity';

// Почтовый адаптер (S1 личка-email) за абстракцией: без SMTP-конфигурации всё —
// тихий no-op (как sms/telegram/storage). Конфиг из env (Lockbox → fetch-secrets):
// SMTP_HOST/PORT/USER/PASSWORD/FROM. Провайдер по умолчанию — Yandex Cloud Postbox.

let cached: Transporter | null | undefined;

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function transport(): Transporter | null {
  if (cached !== undefined) return cached;
  if (!emailConfigured()) {
    cached = null;
    return null;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
  });
  return cached;
}

/**
 * Общий футер писем (аудит 2026-08-01, P2).
 *
 * Письма уходили голым текстом: без идентификации отправителя, без реквизитов
 * оператора и без способа отписаться. Это одновременно типовая претензия по
 * 152-ФЗ и ускоритель попадания в спам — почтовые провайдеры считают отсутствие
 * идентификации и unsubscribe признаком нежелательной рассылки.
 *
 * Служебные письма (сброс пароля, подтверждение адреса) отписки не предлагают:
 * это транзакционные сообщения по действию самого пользователя, отключать их
 * нельзя — но отправитель в них называется так же.
 */
function emailFooter(kind: 'transactional' | 'notification'): string {
  const lines = ['', '—', ru.email.footerSender(operatorLine())];
  if (kind === 'notification') lines.push(ru.email.footerPrefs(`${BASE_URL}/ru/cabinet`));
  lines.push(ru.email.footerPolicy(`${BASE_URL}/ru/legal/privacy`));
  return lines.join('\n');
}

/**
 * Отправка письма. Ошибки не роняют поток (уведомление не критично).
 * kind различает транзакционные письма и уведомления: у вторых в футере есть
 * ссылка на управление рассылкой.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  kind: 'transactional' | 'notification' = 'notification',
): Promise<void> {
  const t = transport();
  if (!t) return;
  const from = process.env.SMTP_FROM ?? MAIL_FROM_DEFAULT;
  try {
    await t.sendMail({ from, to, subject, text: `${text}\n${emailFooter(kind)}` });
  } catch (e) {
    // Раньше провал уходил только в консоль контейнера, которую никто не
    // читает: автор не получал письмо подтверждения, а платформа считала, что
    // отправила. Теперь о поломке узнаёт оператор — молчание не должно
    // выглядеть как успех.
    console.error('[email] send failed:', e);
    // В ответе SMTP штатно фигурирует адрес получателя — в служебный канал
    // он попадать не должен: это персональные данные третьего лица
    const raw = e instanceof Error ? e.message : 'SMTP';
    void alertOperator(ru.operatorAlerts.mailSendFailed(subject, maskEmails(raw)));
  }
}

/**
 * Проверка соединения и аутентификации SMTP, без отправки письма.
 *
 * Отделяет «сервер нас не пускает» от «сервер принял, но получатель не увидел»
 * — это разные поломки с разным лечением, и без такого разделения починка
 * начинается с гадания.
 */
export async function verifyMailTransport(): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = transport();
  if (!t) return { ok: false, error: 'SMTP не сконфигурирован' };
  try {
    await t.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'неизвестная ошибка SMTP' };
  }
}

/**
 * Отправка с возвратом ошибки вместо её проглатывания.
 *
 * Обычный `sendEmail` не роняет поток намеренно: пользователь не должен терять
 * регистрацию из-за недоступного почтового сервера. Но в диагностике нужна
 * ровно противоположная вещь — точный текст отказа провайдера.
 */
export async function sendEmailStrict(
  to: string,
  subject: string,
  text: string,
  kind: 'transactional' | 'notification' = 'transactional',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = transport();
  if (!t) return { ok: false, error: 'SMTP не сконфигурирован' };
  const from = process.env.SMTP_FROM ?? MAIL_FROM_DEFAULT;
  try {
    await t.sendMail({ from, to, subject, text: `${text}\n${emailFooter(kind)}` });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'неизвестная ошибка SMTP' };
  }
}

/** Маскирует адреса почты в тексте: `и***@домен` вместо полного адреса. */
function maskEmails(text: string): string {
  return text.replace(/([\w.+-])[\w.+-]*@([\w.-]+)/g, '$1***@$2');
}
