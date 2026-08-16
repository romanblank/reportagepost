import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import 'dotenv/config';

// Регрессионные тесты АУТЕНТИФИКАЦИИ (аудит: фикс захвата аккаунта через
// OAuth-линковку и HTTP-слой login не были покрыты ничем).
//
// Главный инвариант — гард линковки: привязать yandexId к найденному по email
// аккаунту можно ТОЛЬКО если адрес подтверждён ИЛИ у аккаунта нет пароля.
// Иначе сценарий захвата: злоумышленник регистрирует аккаунт на ЧУЖУЮ почту
// (подтверждение при регистрации не требуется) со СВОИМ паролем — и когда
// настоящий владелец адреса входит через Яндекс, он попадает в аккаунт,
// пароль от которого знает посторонний.
//
// Обмен кода на токен у Яндекса мокается (наружу тесты не ходят); БД, JWT и
// argon2 — настоящие.

// JWT-подпись требует секрет ≥32 символов; в тестовом окружении генерируем,
// если не задан (значение одноразовое, ничего не «шифрует» надолго)
process.env.AUTH_SECRET ||= randomBytes(32).toString('hex');

// ─── Мок Яндекс-OAuth: профиль подставляется per-test ───────────────────────
const yx = vi.hoisted(() => ({
  profile: { yandexId: 'unset', email: null as string | null, firstName: 'Тест', lastName: 'Яндексов' },
}));
vi.mock('@/lib/yandex-oauth', () => ({
  yandexOAuthConfigured: () => true,
  yandexStartConfigured: () => true,
  buildAuthUrl: () => 'https://oauth.yandex.ru/authorize?mock=1',
  exchangeCode: async () => 'mock-access-token',
  fetchYandexUser: async () => yx.profile,
}));

// ─── Мок rate-limit: считаем вызовы, по флагу отдаём 429 ────────────────────
// Реальный rateLimit пишет счётчики в БД — в тестах это создавало бы
// межтестовое состояние. Мок фиксирует ключи (что гард ВООБЩЕ вызван —
// у платформы уже был написанный-но-не-подключённый гард) и умеет имитировать
// превышение.
const rl = vi.hoisted(() => ({ calls: [] as string[], block: false }));
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return {
    ...actual,
    rateLimit: async (key: string) => {
      rl.calls.push(key);
      if (rl.block) {
        const { DomainError } = await import('@/lib/errors');
        throw new DomainError('rate_limited', 429);
      }
    },
  };
});

const hasDb = Boolean(process.env.DATABASE_URL);

beforeEach(() => {
  rl.calls = [];
  rl.block = false;
});

// Запрос к callback Яндекса: state в query и в cookie совпадают (CSRF-проверка
// роута должна пройти, тестируем то, что ЗА ней)
async function yandexCallback(stamp: string) {
  const { NextRequest } = await import('next/server');
  const { YANDEX_STATE_COOKIE } = await import('@/lib/auth');
  const state = `st-${stamp}`;
  const req = new NextRequest(
    `https://reportagepost.com/api/auth/yandex/callback?code=mock-code&state=${state}`,
    { headers: { cookie: `${YANDEX_STATE_COOKIE}=${state}` } },
  );
  const { GET } = await import('@/app/api/auth/yandex/callback/route');
  return GET(req);
}

const setCookies = (res: Response) => res.headers.getSetCookie().join('; ');

describe.skipIf(!hasDb)('Яндекс-callback: гард линковки OAuth к существующему аккаунту (БД)', () => {
  it('аккаунт с паролем и НЕподтверждённой почтой НЕ линкуется (сценарий захвата)', async () => {
    const { db } = await import('@/lib/db');
    const { hashPassword } = await import('@/lib/auth');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    // Пароль собирается генератором — сканер секретов в гейте справедливо
    // не отличает выдуманный пароль-строку от настоящего
    const attackerPassword = `Aa1-${randomBytes(9).toString('hex')}`;

    // «Атакующий» завёл аккаунт на чужой адрес со своим паролем; почта
    // не подтверждена — подтвердить её он и не может
    const victimEmail = `victim-${stamp}@test.local`;
    const attacker = await db.user.create({
      data: {
        role: 'CLIENT', status: 'ACTIVE', firstName: 'З', lastName: 'Лоумышленник',
        email: victimEmail, passwordHash: await hashPassword(attackerPassword),
        emailVerifiedAt: null,
      },
    });

    try {
      yx.profile = { yandexId: `yx-a-${stamp}`, email: victimEmail, firstName: 'Ж', lastName: 'Ертва' };
      const res = await yandexCallback(stamp);

      // Жертву НЕ пускаем в чужой аккаунт: редирект с ошибкой, без сессии
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get('location')).toContain('error=email_taken');
      expect(setCookies(res)).not.toContain('rp_session=');

      // И аккаунт не тронут: yandexId не привязан, почта не «подтвердилась»
      const after = await db.user.findUniqueOrThrow({ where: { id: attacker.id } });
      expect(after.yandexId).toBeNull();
      expect(after.emailVerifiedAt).toBeNull();
    } finally {
      await db.user.delete({ where: { id: attacker.id } });
    }
  });

  it('аккаунт с ПОДТВЕРЖДЁННОЙ почтой линкуется и получает сессию', async () => {
    const { db } = await import('@/lib/db');
    const { hashPassword } = await import('@/lib/auth');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const email = `owner-${stamp}@test.local`;
    const owner = await db.user.create({
      data: {
        role: 'CLIENT', status: 'ACTIVE', firstName: 'В', lastName: 'Ладелец',
        email, passwordHash: await hashPassword(`Bb2-${randomBytes(9).toString('hex')}`),
        emailVerifiedAt: new Date(),
      },
    });

    try {
      yx.profile = { yandexId: `yx-b-${stamp}`, email, firstName: 'В', lastName: 'Ладелец' };
      const res = await yandexCallback(stamp);

      expect(res.headers.get('location')).toContain('/ru/cabinet');
      expect(setCookies(res)).toContain('rp_session=');

      const after = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
      expect(after.yandexId).toBe(`yx-b-${stamp}`);
    } finally {
      await db.user.delete({ where: { id: owner.id } });
    }
  });

  it('аккаунт БЕЗ пароля (создан через OAuth) линкуется, почта помечается подтверждённой', async () => {
    const { db } = await import('@/lib/db');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const email = `oauth-${stamp}@test.local`;
    // Пароля нет — украсть такой аккаунт через «свой пароль» некому
    const owner = await db.user.create({
      data: {
        role: 'CLIENT', status: 'ACTIVE', firstName: 'Б', lastName: 'Езпарольный',
        email, passwordHash: null, emailVerifiedAt: null,
      },
    });

    try {
      yx.profile = { yandexId: `yx-c-${stamp}`, email, firstName: 'Б', lastName: 'Езпарольный' };
      const res = await yandexCallback(stamp);

      expect(res.headers.get('location')).toContain('/ru/cabinet');
      expect(setCookies(res)).toContain('rp_session=');

      const after = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
      expect(after.yandexId).toBe(`yx-c-${stamp}`);
      // Вход через Яндекс — доказательство владения адресом
      expect(after.emailVerifiedAt).not.toBeNull();
    } finally {
      await db.user.delete({ where: { id: owner.id } });
    }
  });
});

// Тот же гард живёт ВТОРОЙ копией в complete-роуте (гонка «аккаунт появился
// между callback и выбором роли»). Дублированное условие — ровно то место,
// где правка одной копии молча оставляет дыру во второй, поэтому стережём обе.
describe.skipIf(!hasDb)('Яндекс-complete: гард линковки продублирован и там (БД)', () => {
  it('аккаунт с паролем и неподтверждённой почтой → 409 email_taken, без линковки', async () => {
    const { db } = await import('@/lib/db');
    const { hashPassword, createYandexPendingToken, YANDEX_PENDING_COOKIE } = await import('@/lib/auth');
    const { NextRequest } = await import('next/server');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const victimEmail = `victim2-${stamp}@test.local`;
    const attacker = await db.user.create({
      data: {
        role: 'CLIENT', status: 'ACTIVE', firstName: 'З', lastName: 'Лоумышленник',
        email: victimEmail, passwordHash: await hashPassword(`Cc3-${randomBytes(9).toString('hex')}`),
        emailVerifiedAt: null,
      },
    });

    try {
      // Pending-токен подписан по-настоящему — клиентскому телу роут не верит
      const pending = await createYandexPendingToken({
        yandexId: `yx-d-${stamp}`, email: victimEmail, firstName: 'Ж', lastName: 'Ертва',
      });
      const { POST } = await import('@/app/api/auth/yandex/complete/route');
      const res = await POST(new NextRequest('https://reportagepost.com/api/auth/yandex/complete', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${YANDEX_PENDING_COOKIE}=${pending}`,
          'x-real-ip': '10.7.7.7',
        },
        body: JSON.stringify({ role: 'CLIENT', pdnConsent: true }),
      }));

      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('email_taken');
      expect(setCookies(res)).not.toContain('rp_session=');

      const after = await db.user.findUniqueOrThrow({ where: { id: attacker.id } });
      expect(after.yandexId).toBeNull();
      expect(after.emailVerifiedAt).toBeNull();
    } finally {
      await db.user.delete({ where: { id: attacker.id } });
    }
  });
});

// ─── Login: rate-limit — единственный антибрутфорс платформы ────────────────
describe('login: rate-limit подключён, а не только написан', () => {
  const loginReq = (body: unknown) =>
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '10.9.9.9' },
      body: JSON.stringify(body),
    });

  it('превышение лимита → 429 ещё до обращения к паролям', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    rl.block = true;
    const res = await POST(loginReq({ email: 'whoever@test.local', password: 'x' }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('rate_limited');
    // Гард действительно был вызван (мёртвый гейт у платформы уже случался)
    expect(rl.calls.length).toBeGreaterThan(0);
  });

  it.skipIf(!hasDb)('лимит считается и по IP, и по email (два независимых ключа)', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await POST(loginReq({ email: `nobody-${stamp}@test.local`, password: 'x' }));
    expect(rl.calls.some((k) => k.startsWith('login:ip:'))).toBe(true);
    expect(rl.calls.some((k) => k.startsWith(`login:email:nobody-${stamp}`))).toBe(true);
  });
});

// ─── Login: коды ответов и отсутствие утечки ────────────────────────────────
describe.skipIf(!hasDb)('login: неверные данные не различимы, успех ставит cookie (БД)', () => {
  it('несуществующий email и неверный пароль дают ОДИНАКОВЫЙ ответ; верный пароль — сессию', async () => {
    const { db } = await import('@/lib/db');
    const { hashPassword } = await import('@/lib/auth');
    const { POST } = await import('@/app/api/auth/login/route');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const email = `login-${stamp}@test.local`;
    const password = `Dd4-${randomBytes(9).toString('hex')}`;
    const user = await db.user.create({
      data: {
        role: 'CLIENT', status: 'ACTIVE', firstName: 'Л', lastName: 'Огинов',
        email, passwordHash: await hashPassword(password),
      },
    });

    const call = (body: unknown) =>
      POST(new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': '10.8.8.8' },
        body: JSON.stringify(body),
      }));

    try {
      // «Нет такого пользователя» и «не тот пароль» обязаны быть неотличимы:
      // различие позволило бы перечислять зарегистрированные адреса
      const noUser = await call({ email: `ghost-${stamp}@test.local`, password });
      const badPass = await call({ email, password: `${password}-wrong` });
      expect(noUser.status).toBe(401);
      expect(badPass.status).toBe(401);
      const bodyNoUser = await noUser.json();
      const bodyBadPass = await badPass.json();
      expect(bodyNoUser).toEqual(bodyBadPass);
      expect(bodyNoUser.error).toBe('invalid_credentials');
      // Ни в одном отказе не должно быть сессии
      expect(setCookies(noUser)).not.toContain('rp_session=');
      expect(setCookies(badPass)).not.toContain('rp_session=');

      // Успешный вход: 200, cookie httpOnly-сессии, роль в теле
      const ok = await call({ email, password });
      expect(ok.status).toBe(200);
      const body = await ok.json();
      expect(body.userId).toBe(user.id);
      expect(body.role).toBe('CLIENT');
      const cookie = ok.headers.getSetCookie().find((c) => c.startsWith('rp_session='));
      expect(cookie).toBeDefined();
      expect(cookie).toContain('HttpOnly');
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it('мусорное тело → 400 validation, а не 500', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const call = (raw: string) =>
      POST(new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': '10.8.8.9' },
        body: raw,
      }));
    expect((await call('не json')).status).toBe(400);
    expect((await call(JSON.stringify({ email: 'не-адрес', password: 'x' }))).status).toBe(400);
    expect((await call(JSON.stringify({ email: 'a@b.ru' }))).status).toBe(400);
  });
});
