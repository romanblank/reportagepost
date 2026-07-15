import { describe, expect, it } from 'vitest';
import { computeToken, verifyWebhookToken } from '@/lib/tinkoff';

describe('tinkoff: подпись Token (спека Tinkoff — скаляры+Password, сортировка, sha256)', () => {
  it('computeToken детерминирован по фиксированному вектору', () => {
    const token = computeToken(
      { TerminalKey: 'MerchantTerminalKey', Amount: 19200, OrderId: '21050', Description: 'Подарочная карта на 1000 рублей' },
      'usaf8fw8fsw21g',
    );
    expect(token).toBe('c25b8314764b49ed1dfd68c196bb8ad64397de34b5c0e460c216f4b08176c789');
  });

  it('вложенные объекты (Receipt/DATA) не участвуют в подписи', () => {
    const base = { TerminalKey: 'T', Amount: 100, OrderId: 'o1' };
    const withNested = { ...base, Receipt: { Items: [{ Name: 'PRO' }] }, DATA: { k: 'v' } } as Record<string, unknown>;
    expect(computeToken(withNested as never, 'pw')).toBe(computeToken(base, 'pw'));
  });

  it('булевы значения стрингуются (Success:true)', () => {
    const t = computeToken({ TerminalKey: 'T', Success: true, Status: 'CONFIRMED' }, 'pw');
    expect(t).toBe(computeToken({ TerminalKey: 'T', Success: 'true', Status: 'CONFIRMED' }, 'pw'));
  });

  it('verifyWebhookToken: корректный round-trip → true; подделка → false; без Token → false', () => {
    const pw = 'secretpw';
    const payload = { TerminalKey: 'T', OrderId: 'o1', Success: true, Status: 'CONFIRMED', PaymentId: 12345, Amount: 19900 };
    const token = computeToken(payload, pw);
    expect(verifyWebhookToken({ ...payload, Token: token }, pw)).toBe(true);
    // подделка суммы
    expect(verifyWebhookToken({ ...payload, Amount: 1, Token: token }, pw)).toBe(false);
    // неверный пароль
    expect(verifyWebhookToken({ ...payload, Token: token }, 'wrongpw')).toBe(false);
    // нет Token
    expect(verifyWebhookToken(payload, pw)).toBe(false);
  });
});
