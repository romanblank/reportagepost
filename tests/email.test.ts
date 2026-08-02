import { describe, expect, it } from 'vitest';
import { emailConfigured, sendEmail } from '@/lib/email';

describe('email: no-op без SMTP-конфигурации', () => {
  it('emailConfigured=false и sendEmail не бросает без ключей', async () => {
    const saved = {
      host: process.env.SMTP_HOST,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    expect(emailConfigured()).toBe(false);
    await expect(sendEmail('x@test.local', 'тема', 'текст')).resolves.toBeUndefined();
    if (saved.host !== undefined) process.env.SMTP_HOST = saved.host;
    if (saved.user !== undefined) process.env.SMTP_USER = saved.user;
    if (saved.pass !== undefined) process.env.SMTP_PASSWORD = saved.pass;
  });
});

// «Молчание = всё хорошо» — самый дорогой класс ошибок в этом проекте
// (бэкапы-пустышки, мёртвый watchdog, теперь письма). Health обязан показывать
// состояние интеграций, иначе «письма не приходят» неотличимо от «письма
// отправляются и теряются», и разбирательство начинается с гадания.
describe('health: состояние интеграций видно снаружи', () => {
  it('показывает почту, хранилище и премодерацию, не раскрывая ключей', async () => {
    const { GET } = await import('@/app/health/route');
    const res = await GET();
    const body = await res.json();

    expect(body.integrations).toBeTruthy();
    expect(['on', 'off']).toContain(body.integrations.mail);
    expect(['s3', 'disk']).toContain(body.integrations.storage);
    expect(['on', 'off']).toContain(body.integrations.telegram);

    // Ни одного значения секрета в ответе быть не должно
    const asText = JSON.stringify(body);
    for (const key of ['SMTP_PASSWORD', 'SMTP_USER', 'TELEGRAM_BOT_TOKEN', 'S3_SECRET_ACCESS_KEY']) {
      const value = process.env[key];
      if (value) expect(asText).not.toContain(value);
    }
  });
});
