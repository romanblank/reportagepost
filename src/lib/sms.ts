// SMS-адаптер за интерфейсом (глобальный задел): сейчас SMSC.ru, провайдер
// меняется реализацией. HTTP API SMSC: https://smsc.ru/api/http/
import { DomainError } from '@/lib/errors';

export interface SmsProvider {
  isConfigured(): boolean;
  send(phoneE164: string, text: string): Promise<{ id: string }>;
}

class SmscProvider implements SmsProvider {
  private login = process.env.SMSC_LOGIN ?? '';
  private password = process.env.SMSC_PASSWORD ?? '';
  private sender = process.env.SMSC_SENDER; // имя отправителя (после модерации)

  isConfigured(): boolean {
    return Boolean(this.login && this.password);
  }

  async send(phoneE164: string, text: string): Promise<{ id: string }> {
    if (!this.isConfigured()) throw new DomainError('sms_not_configured', 503);

    const params = new URLSearchParams({
      login: this.login,
      psw: this.password,
      phones: phoneE164,
      mes: text,
      fmt: '3', // JSON-ответ
      charset: 'utf-8',
    });
    if (this.sender) params.set('sender', this.sender);

    const res = await fetch('https://smsc.ru/sys/send.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new DomainError('sms_provider_http', 502);

    // Guard ПОСЛЕ ответа (правило: не доверять внешнему): валидируем структуру
    const data: unknown = await res.json().catch(() => null);
    if (
      typeof data !== 'object' ||
      data === null ||
      'error' in data ||
      !('id' in data) ||
      typeof (data as { id: unknown }).id !== 'number'
    ) {
      const code =
        data && typeof data === 'object' && 'error_code' in data
          ? String((data as { error_code: unknown }).error_code)
          : 'unknown';
      throw new DomainError(`sms_send_failed:${code}`, 502);
    }
    return { id: String((data as { id: number }).id) };
  }
}

export const smsProvider: SmsProvider = new SmscProvider();
