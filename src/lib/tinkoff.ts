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

// ─── 54-ФЗ Receipt + Init ───────────────────────────────────────────────────
// Порт из Verifi (backend/app/services/tinkoff.py, проверено в бою). Receipt
// обязателен для фискализации: УСН (Tax 'none'), предмет — услуга, одна позиция.

export interface TinkoffReceipt {
  Taxation: 'usn_income';
  Items: Array<{
    Name: string;
    Quantity: number;
    Amount: number;
    Price: number;
    Tax: 'none';
    PaymentMethod: string;
    PaymentObject: 'service';
  }>;
  Email?: string;
  Phone?: string;
}

/** Обрезка строки по БАЙТАМ UTF-8 (лимит Name у ОФД — 128 БАЙТ, не символов;
 *  кириллица = 2 байта). Режем по целым символам. */
export function truncateUtf8(s: string, maxBytes: number): string {
  const enc = Buffer.from(s, 'utf8');
  if (enc.length <= maxBytes) return s;
  return enc.subarray(0, maxBytes).toString('utf8').replace(/�+$/, '');
}

/** Receipt-блок 54-ФЗ для одной позиции-услуги (подписка). Нужен Email ИЛИ Phone. */
export function buildReceipt(input: {
  amountMinor: number;
  itemName: string;
  email?: string | null;
  phone?: string | null;
  paymentMethod?: string; // из перечня Т-Банка; НЕЛЬЗЯ 'full_refund' (нет такого → 9999)
}): TinkoffReceipt {
  const receipt: TinkoffReceipt = {
    Taxation: 'usn_income',
    Items: [
      {
        Name: truncateUtf8(input.itemName, 128),
        Quantity: 1, // int (float может срендериться ОФД как «1.00000»)
        Amount: input.amountMinor,
        Price: input.amountMinor,
        Tax: 'none',
        PaymentMethod: input.paymentMethod ?? 'full_payment',
        PaymentObject: 'service',
      },
    ],
  };
  if (input.email) receipt.Email = input.email;
  if (input.phone) receipt.Phone = input.phone;
  return receipt;
}

export interface InitInput {
  amountMinor: number;
  orderId: string;
  description: string;
  successUrl: string;
  failUrl: string;
  notificationUrl: string;
  email?: string | null;
  phone?: string | null;
  itemName?: string;
}

/** Собирает ПОДПИСАННЫЙ запрос Init (чистая функция — тестируемо без сети).
 *  Токен считается по top-level скалярам (Receipt в подпись НЕ входит). */
export function buildInitRequest(input: InitInput, terminalKey: string, password: string): Record<string, unknown> {
  const scalars: Record<string, Scalar> = {
    TerminalKey: terminalKey,
    Amount: input.amountMinor,
    OrderId: input.orderId,
    Description: input.description.slice(0, 140),
    SuccessURL: input.successUrl,
    FailURL: input.failUrl,
    NotificationURL: input.notificationUrl,
    PayType: 'O', // одностадийный захват
  };
  const token = computeToken(scalars, password);
  return {
    ...scalars,
    Receipt: buildReceipt({
      amountMinor: input.amountMinor,
      itemName: input.itemName ?? input.description,
      email: input.email,
      phone: input.phone,
    }),
    Token: token,
  };
}

const TINKOFF_API = process.env.TINKOFF_API_URL ?? 'https://securepay.tinkoff.ru/v2';

/** Создаёт платёж в Т-Кассе (POST /Init) → { paymentUrl, paymentId }. Бросает,
 *  если не сконфигурирован, нет Email/Phone (54-ФЗ) или Init вернул ошибку. */
export async function createPayment(input: InitInput): Promise<{ paymentUrl: string; paymentId: string }> {
  const terminalKey = process.env.TINKOFF_TERMINAL_KEY;
  const password = process.env.TINKOFF_PASSWORD;
  if (!terminalKey || !password) throw new Error('tinkoff_not_configured');
  if (!input.email && !input.phone) throw new Error('receipt_requires_email_or_phone');

  const request = buildInitRequest(input, terminalKey, password);
  // Дедлайн: Init стоит в пути оформления подписки — единственном пути к
  // метрике №1; зависший банк не должен держать запрос вечно
  const res = await fetch(`${TINKOFF_API}/Init`, {
    signal: AbortSignal.timeout(15_000),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const data = (await res.json().catch(() => null)) as
    | { Success?: boolean; PaymentURL?: string; PaymentId?: string | number; ErrorCode?: string; Message?: string; Details?: string }
    | null;
  if (!data?.Success || !data.PaymentURL || data.PaymentId == null) {
    throw new Error(`tinkoff_init_failed: ${data?.ErrorCode ?? '?'} ${data?.Message ?? data?.Details ?? 'unknown'}`);
  }
  return { paymentUrl: data.PaymentURL, paymentId: String(data.PaymentId) };
}
