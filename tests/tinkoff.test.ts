import { describe, expect, it } from 'vitest';
import { computeToken, verifyWebhookToken, buildReceipt, truncateUtf8, buildInitRequest } from '@/lib/tinkoff';

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

describe('tinkoff: Receipt 54-ФЗ + Init', () => {
  it('truncateUtf8 режет по БАЙТАМ (кириллица = 2 байта), целыми символами', () => {
    const s = 'а'.repeat(65); // 130 байт
    const t = truncateUtf8(s, 128);
    expect(Buffer.from(t, 'utf8').length).toBeLessThanOrEqual(128);
    expect(t.length).toBe(64); // 64 кириллических символа = 128 байт
    expect(truncateUtf8('short', 128)).toBe('short');
    expect(t.endsWith('�')).toBe(false); // без битого хвоста
  });

  it('buildReceipt: УСН, услуга, одна позиция, Email/Phone', () => {
    const r = buildReceipt({ amountMinor: 99000, itemName: 'Подписка Active — Москва', email: 'a@b.ru' });
    expect(r.Taxation).toBe('usn_income');
    expect(r.Items).toHaveLength(1);
    const it0 = r.Items[0];
    expect(it0).toMatchObject({ Quantity: 1, Amount: 99000, Price: 99000, Tax: 'none', PaymentMethod: 'full_payment', PaymentObject: 'service' });
    expect(r.Email).toBe('a@b.ru');
    expect(r.Phone).toBeUndefined();
    // телефон вместо почты
    expect(buildReceipt({ amountMinor: 1, itemName: 'x', phone: '+79990000000' }).Phone).toBe('+79990000000');
  });

  it('buildInitRequest: Token только по скалярам (Receipt/DATA не в подписи), PayType O, Description ≤140', () => {
    const input = {
      amountMinor: 99000, orderId: 'ord-1', description: 'Подписка Active',
      successUrl: 'https://x/ok', failUrl: 'https://x/fail', notificationUrl: 'https://x/hook',
      email: 'a@b.ru',
    };
    const req = buildInitRequest(input, 'TERM', 'pw');
    expect(req.PayType).toBe('O');
    expect(req.Receipt).toBeDefined();
    // Token совпадает с подписью по скалярам (без Receipt/Token)
    const { Receipt, Token, ...scalars } = req as Record<string, unknown>;
    void Receipt;
    expect(Token).toBe(computeToken(scalars as never, 'pw'));
    // Description режется до 140
    const longReq = buildInitRequest({ ...input, description: 'д'.repeat(200) }, 'TERM', 'pw');
    expect((longReq.Description as string).length).toBe(140);
  });
});
