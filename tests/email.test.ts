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
