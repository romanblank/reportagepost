import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import 'dotenv/config';

// HTTP-слой денежного контура: вебхук Т-Кассы и инициация оплаты. Эти два роута
// не были покрыты ничем, при том что именно здесь ошибка не «ломает страницу»,
// а тихо теряет деньги: пропущенная проверка Token = зачисление подписки по
// поддельному запросу, неверный ответ банку = потерянный платёж без следа.
//
// Сессия мокается (в юнит-окружении нет next/headers-куки). applyPaymentStatus
// обёрнут управляемым мостом: по умолчанию работает настоящий, флаг failApply
// имитирует сбой БД в момент прихода вебхука.

const session = vi.hoisted(() => ({ current: null as null | { userId: string; role: string; tokenVersion: number } }));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSession: async () => session.current };
});

const billingCtl = vi.hoisted(() => ({ failApply: false }));
vi.mock('@/lib/billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing')>();
  return {
    ...actual,
    applyPaymentStatus: async (...args: Parameters<typeof actual.applyPaymentStatus>) => {
      if (billingCtl.failApply) throw new Error('тест: база недоступна в момент вебхука');
      return actual.applyPaymentStatus(...args);
    },
  };
});

const hasDb = Boolean(process.env.DATABASE_URL);

// Пароль терминала — сгенерирован, а не литерал: сканер секретов в гейте
// справедливо не отличает выдуманный пароль в тесте от настоящего.
const tkPass = randomBytes(16).toString('hex');

const webhookReq = (body: unknown) =>
  new Request('http://localhost/api/tinkoff/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// Подписанное тело вебхука: Token считается той же чистой функцией, что и в
// проде (computeToken покрыта отдельно в tests/tinkoff.test.ts эталонами).
async function signed(fields: Record<string, string | number | boolean>): Promise<Record<string, unknown>> {
  const { computeToken } = await import('@/lib/tinkoff');
  return { ...fields, Token: computeToken(fields, tkPass) };
}

async function withTinkoffEnv<T>(fn: () => Promise<T>): Promise<T> {
  const savedPass = process.env.TINKOFF_PASSWORD;
  const savedKey = process.env.TINKOFF_TERMINAL_KEY;
  process.env.TINKOFF_PASSWORD = tkPass;
  process.env.TINKOFF_TERMINAL_KEY = `term-${randomBytes(6).toString('hex')}`;
  try {
    return await fn();
  } finally {
    if (savedPass === undefined) delete process.env.TINKOFF_PASSWORD;
    else process.env.TINKOFF_PASSWORD = savedPass;
    if (savedKey === undefined) delete process.env.TINKOFF_TERMINAL_KEY;
    else process.env.TINKOFF_TERMINAL_KEY = savedKey;
  }
}

beforeEach(() => {
  session.current = null;
  billingCtl.failApply = false;
});

// Token — единственная защита вебхука от спуфинга: эндпоинт публичный, и без
// проверки подписи кто угодно зачислил бы себе подписку одним curl-запросом.
describe('вебхук Т-Кассы: антиспуфинг', () => {
  it('битый или отсутствующий Token → 403, статус не применяется', async () => {
    await withTinkoffEnv(async () => {
      const { POST } = await import('@/app/api/tinkoff/webhook/route');

      // Правильные поля, но Token от другого пароля
      const forged = { OrderId: 'ord-x', Status: 'CONFIRMED', Success: true, Token: randomBytes(32).toString('hex') };
      expect((await POST(webhookReq(forged))).status).toBe(403);

      // Без Token вовсе
      expect((await POST(webhookReq({ OrderId: 'ord-x', Status: 'CONFIRMED' }))).status).toBe(403);

      // Не-JSON тоже не проходит
      expect((await POST(new Request('http://localhost/api/tinkoff/webhook', { method: 'POST', body: 'не json' }))).status).toBe(403);
    });
  });
});

// Контракт ретраев Т-Кассы: банк считает вебхук доставленным ТОЛЬКО по ответу
// "OK" и перестаёт ретраить. Если при сбое нашей обработки вернуть OK — платёж
// подтверждён у провайдера, подписка не зачислена, и повторной попытки не
// будет никогда: тихая потеря денег клиента без единой строки в мониторинге.
describe('вебхук Т-Кассы: сбой обработки не подтверждается банку', () => {
  it('исключение в applyPaymentStatus → ответ не "OK" (5xx, банк будет ретраить)', async () => {
    await withTinkoffEnv(async () => {
      const { POST } = await import('@/app/api/tinkoff/webhook/route');
      billingCtl.failApply = true;
      const res = await POST(webhookReq(await signed({ OrderId: 'ord-fail', Status: 'CONFIRMED', PaymentId: 1 })));
      expect(res.status).toBe(500);
      expect(await res.text()).not.toBe('OK');
    });
  });
});

describe.skipIf(!hasDb)('вебхук Т-Кассы: зачисление (БД)', () => {
  // Двухстадийная схема: AUTHORIZED — деньги лишь захолдированы, захват может
  // не пройти. Зачисление по AUTHORIZED оставило бы подписку активной без
  // реальной оплаты при редком отказе захвата.
  it('AUTHORIZED не зачисляет подписку и не двигает платёж', async () => {
    await withTinkoffEnv(async () => {
      const { db } = await import('@/lib/db');
      const { POST } = await import('@/app/api/tinkoff/webhook/route');
      const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const u = await db.user.create({
        data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'А', lastName: 'В', email: `auth-${stamp}@test.local` },
      });
      try {
        const orderId = `orda-${stamp}`;
        await db.payment.create({ data: { userId: u.id, orderId, amountMinor: 99_000, tier: 'PRIME', status: 'NEW' } });

        const res = await POST(webhookReq(await signed({ OrderId: orderId, Status: 'AUTHORIZED', Success: true })));
        expect(res.status).toBe(200); // приём подтверждаем — банк не должен ретраить промежуточный статус

        expect((await db.payment.findUniqueOrThrow({ where: { orderId } })).status).toBe('NEW');
        expect(await db.subscription.findUnique({ where: { userId: u.id } })).toBeNull();
      } finally {
        await db.payment.deleteMany({ where: { userId: u.id } });
        await db.user.delete({ where: { id: u.id } });
      }
    });
  });

  // Т-Касса присылает вебхук повторно при любом сомнении в доставке — повтор
  // CONFIRMED не должен продлевать подписку второй раз (двойное зачисление за
  // один платёж — прямой денежный дефект).
  it('повторный CONFIRMED идемпотентен: период не продлевается дважды', async () => {
    await withTinkoffEnv(async () => {
      const { db } = await import('@/lib/db');
      const { POST } = await import('@/app/api/tinkoff/webhook/route');
      const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const u = await db.user.create({
        data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'И', lastName: 'Д', email: `idem-${stamp}@test.local` },
      });
      try {
        const orderId = `ordi-${stamp}`;
        await db.payment.create({ data: { userId: u.id, orderId, amountMinor: 99_000, tier: 'PRIME', status: 'NEW' } });
        const body = await signed({ OrderId: orderId, Status: 'CONFIRMED', Success: true, PaymentId: `tpw-${stamp}` });

        expect((await POST(webhookReq(body))).status).toBe(200);
        const end1 = (await db.subscription.findUniqueOrThrow({ where: { userId: u.id } })).currentPeriodEnd!.getTime();

        // Тот же вебхук ещё раз — ответ снова OK (банку хватит), но без зачисления
        expect((await POST(webhookReq(body))).status).toBe(200);
        const sub2 = await db.subscription.findUniqueOrThrow({ where: { userId: u.id } });
        expect(sub2.currentPeriodEnd!.getTime()).toBe(end1);
        expect((await db.payment.findUniqueOrThrow({ where: { orderId } })).status).toBe('CONFIRMED');
      } finally {
        await db.payment.deleteMany({ where: { userId: u.id } });
        await db.subscription.deleteMany({ where: { userId: u.id } });
        await db.user.delete({ where: { id: u.id } });
      }
    });
  });
});

// Checkout — единственная дверь к деньгам со стороны пользователя. Открытая
// без сессии она создавала бы платёжные записи от кого угодно (мусор в
// бухгалтерии, антифрод-претензии эквайера), а молчаливый успех без терминала
// сломал бы фолбэк UI на ручную заявку.
describe('роут checkout подписки: гарды', () => {
  it('без сессии → 401', async () => {
    const { POST } = await import('@/app/api/subscription/checkout/route');
    session.current = null;
    const res = await POST(webhookReq({ tier: 'PRIME' }));
    expect(res.status).toBe(401);
  });

  it('не-фотограф → 403 (заказчику подписка не продаётся)', async () => {
    if (!hasDb) return; // rate-limit до проверки роли ходит в БД
    const { db } = await import('@/lib/db');
    const { POST } = await import('@/app/api/subscription/checkout/route');
    const uid = `chk-client-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    session.current = { userId: uid, role: 'CLIENT', tokenVersion: 0 };
    try {
      const res = await POST(webhookReq({ tier: 'PRIME' }));
      expect(res.status).toBe(403);
    } finally {
      await db.rateLimit.deleteMany({ where: { key: `checkout:user:${uid}` } });
    }
  });

  it('терминал не выдан → not_configured, не-ok (фолбэк на ручную заявку)', async () => {
    if (!hasDb) return;
    const { db } = await import('@/lib/db');
    const { POST } = await import('@/app/api/subscription/checkout/route');
    const uid = `chk-nocfg-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    session.current = { userId: uid, role: 'PHOTOGRAPHER', tokenVersion: 0 };

    const savedPass = process.env.TINKOFF_PASSWORD;
    const savedKey = process.env.TINKOFF_TERMINAL_KEY;
    delete process.env.TINKOFF_PASSWORD;
    delete process.env.TINKOFF_TERMINAL_KEY;
    try {
      const res = await POST(webhookReq({ tier: 'PRIME' }));
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe('not_configured');
      // Висящих платёжных записей ветка не оставляет — Payment создаётся ПОСЛЕ проверки
      expect(await db.payment.count({ where: { userId: uid } })).toBe(0);
    } finally {
      if (savedPass !== undefined) process.env.TINKOFF_PASSWORD = savedPass;
      if (savedKey !== undefined) process.env.TINKOFF_TERMINAL_KEY = savedKey;
      await db.rateLimit.deleteMany({ where: { key: `checkout:user:${uid}` } });
    }
  });
});
