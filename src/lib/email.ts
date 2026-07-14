import nodemailer, { type Transporter } from 'nodemailer';

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

/** Отправка письма. Ошибки не роняют поток (уведомление не критично). */
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const t = transport();
  if (!t) return;
  const from = process.env.SMTP_FROM ?? 'no-reply@reportagepost.com';
  try {
    await t.sendMail({ from, to, subject, text });
  } catch (e) {
    console.error('[email] send failed:', e);
  }
}
