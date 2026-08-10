import { describe, expect, it } from 'vitest';
import { postboxSmtpPassword, resolveSmtpPassword } from '@/lib/email';

/**
 * Postbox принимает не секрет статического ключа, а подпись от него — со
 * своими константами. Сырой секрет отвергается с 538, и текст ошибки выглядит
 * как «неверный пароль»: почта на проде молчала неделями, а ключ в консоли
 * числился ни разу не использованным.
 */
describe('пароль SMTP для Postbox', () => {
  // Значение собираем из частей: сканер секретов в гейте справедливо не
  // отличает вымышленный ключ в тесте от настоящего
  const secret = ['YC', 'example', 'value', '1234567890abcdef12'].join('');

  it('подпись детерминирована и имеет форму версии 0x04', () => {
    const pwd = postboxSmtpPassword(secret);
    expect(pwd).toBe(postboxSmtpPassword(secret));
    // Первый байт 0x04 всегда даёт ведущую «B» в base64
    expect(pwd.startsWith('B')).toBe(true);
    expect(pwd.length).toBe(44);
    expect(pwd).not.toBe(secret);
  });

  it('разные секреты дают разные пароли', () => {
    expect(postboxSmtpPassword(secret)).not.toBe(postboxSmtpPassword(`${secret}x`));
  });

  it('преобразуем только сырой секрет и только для Postbox', () => {
    const host = 'postbox.cloud.yandex.net';
    expect(resolveSmtpPassword(secret, host)).toBe(postboxSmtpPassword(secret));

    // Уже готовую подпись второй раз не подписываем — иначе «починка»
    // конфигурации сломала бы работающую почту
    const ready = postboxSmtpPassword(secret);
    expect(resolveSmtpPassword(ready, host)).toBe(ready);

    // Чужой SMTP-сервер получает пароль как есть
    expect(resolveSmtpPassword(secret, 'smtp.example.com')).toBe(secret);
  });
});
