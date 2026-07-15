import { createHash, timingSafeEqual } from 'node:crypto';

// Т-Касса (Tinkoff Acquiring) — вычисление и проверка Token (подпись запроса/
// вебхука). Порт-паттерн из Верифи. Провайдер за абстракцией: без ключей — не
// сконфигурирован (реальные вызовы Init/webhook подключаются при выдаче терминала).
//
// Спецификация Token: берём КОРНЕВЫЕ скалярные параметры (без вложенных объектов
// Receipt/DATA и без самого Token), добавляем Password, сортируем по ключу,
// конкатенируем значения, SHA-256 (hex, нижний регистр).

type Scalar = string | number | boolean;

export function computeToken(params: Record<string, Scalar | null | undefined>, password: string): string {
  const merged: Record<string, string> = { Password: password };
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') continue; // вложенные (Receipt/DATA) не участвуют в подписи
    merged[k] = String(v);
  }
  const concat = Object.keys(merged)
    .sort()
    .map((k) => merged[k])
    .join('');
  return createHash('sha256').update(concat, 'utf8').digest('hex');
}

/** Проверка Token входящего вебхука Т-Кассы (антиспуфинг). Timing-safe. */
export function verifyWebhookToken(body: Record<string, unknown>, password: string): boolean {
  const received = body.Token;
  if (typeof received !== 'string' || received.length === 0) return false;

  const scalars: Record<string, Scalar> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === 'Token') continue;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') continue;
    scalars[k] = v as Scalar;
  }
  const expected = computeToken(scalars, password);

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received.toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function tinkoffConfigured(): boolean {
  return Boolean(process.env.TINKOFF_TERMINAL_KEY && process.env.TINKOFF_PASSWORD);
}

/** Параметры запроса Init с подписью (для будущего вызова API при выдаче терминала). */
export function buildInitParams(input: {
  amountMinor: number;
  orderId: string;
  description: string;
}): Record<string, Scalar> | null {
  const terminalKey = process.env.TINKOFF_TERMINAL_KEY;
  const password = process.env.TINKOFF_PASSWORD;
  if (!terminalKey || !password) return null;
  const params: Record<string, Scalar> = {
    TerminalKey: terminalKey,
    Amount: input.amountMinor, // копейки
    OrderId: input.orderId,
    Description: input.description,
  };
  return { ...params, Token: computeToken(params, password) };
}
