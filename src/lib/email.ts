import nodemailer, { type Transporter } from 'nodemailer';
import { ru } from '@/i18n/ru';
import { BASE_URL } from '@/lib/sitemap';
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
  const from = process.env.SMTP_FROM ?? 'no-reply@reportagepost.com';
  try {
    await t.sendMail({ from, to, subject, text: `${text}\n${emailFooter(kind)}` });
  } catch (e) {
    console.error('[email] send failed:', e);
  }
}
