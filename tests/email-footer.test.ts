import { describe, expect, it, vi } from 'vitest';

// Идентификация отправителя и отписка в письмах (аудит 2026-08-01, P2).
//
// Письма уходили голым текстом: кто отправитель, на каком основании и как
// отказаться — не сказано нигде. Это и типовая претензия по 152-ФЗ, и прямой
// путь в спам: почтовые провайдеры считают отсутствие идентификации признаком
// нежелательной рассылки.

describe('письма: футер идентифицирует оператора и даёт выход', () => {
  it('уведомление несёт оператора, ссылку на настройки и на политику', async () => {
    const sent: { text?: string }[] = [];
    vi.doMock('nodemailer', () => ({
      default: {
        createTransport: () => ({
          sendMail: async (msg: { text?: string }) => { sent.push(msg); },
        }),
      },
    }));
    // Транспорт создаётся только при заданном SMTP
    vi.stubEnv('SMTP_HOST', 'smtp.test.local');
    vi.stubEnv('SMTP_USER', 'u');
    vi.stubEnv('SMTP_PASSWORD', 'p');
    vi.resetModules();

    const { sendEmail } = await import('@/lib/email');
    await sendEmail('someone@test.local', 'Тема', 'Тело письма');

    expect(sent).toHaveLength(1);
    const text = sent[0].text ?? '';
    expect(text).toContain('Тело письма');
    expect(text).toContain('Репортаж Пост');
    // Способ отказаться — обязателен для уведомлений
    expect(text).toMatch(/cabinet/);
    expect(text).toMatch(/legal\/privacy/);

    // Транзакционное письмо отписку не предлагает: отключить подтверждение
    // адреса или сброс пароля нельзя — но отправитель назван и там.
    await sendEmail('someone@test.local', 'Сброс', 'Ссылка', 'transactional');
    const t2 = sent[1].text ?? '';
    expect(t2).toContain('Репортаж Пост');
    expect(t2).not.toMatch(/Настроить или отключить/);

    vi.unstubAllEnvs();
    vi.doUnmock('nodemailer');
  });
});
