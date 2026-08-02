import { describe, expect, it, vi, beforeEach } from 'vitest';
import 'dotenv/config';

// HTTP-слой: 53 route.ts не были покрыты НИЧЕМ (аудит 2026-07-31, P0).
// Тесты бизнес-логики в lib не ловят ошибки самих роутов: снятый admin-гейт,
// потерянную валидацию, неверный код ответа — а это ровно то, что торчит
// наружу. Здесь проверяется контракт роутов: авторизация, гарды, статусы.
//
// Сессия мокается (в юнит-окружении нет next/headers-куки); всё остальное —
// настоящее, включая обращения к БД.

const session = vi.hoisted(() => ({ current: null as null | { userId: string; role: string; tokenVersion: number } }));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSession: async () => session.current };
});

const hasDb = Boolean(process.env.DATABASE_URL);
const req = (body?: unknown, url = 'http://localhost/api/test') =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': `10.0.0.${Math.floor(Math.random() * 250) + 1}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => { session.current = null; });

describe('роуты: гарды авторизации', () => {
  it('админские роуты недоступны без сессии и обычному пользователю', async () => {
    const { PATCH } = await import('@/app/api/admin/reports/[reportId]/route');
    const params = Promise.resolve({ reportId: 'whatever' });

    session.current = null;
    expect((await PATCH(req({ status: 'RESOLVED' }), { params })).status).toBe(403);

    session.current = { userId: 'u1', role: 'CLIENT', tokenVersion: 0 };
    expect((await PATCH(req({ status: 'RESOLVED' }), { params })).status).toBe(403);

    session.current = { userId: 'u2', role: 'PHOTOGRAPHER', tokenVersion: 0 };
    expect((await PATCH(req({ status: 'RESOLVED' }), { params })).status).toBe(403);
  });

  it('блокировка пользователя требует сессии', async () => {
    const { POST } = await import('@/app/api/users/[userId]/block/route');
    session.current = null;
    const res = await POST(req(), { params: Promise.resolve({ userId: 'someone' }) });
    expect(res.status).toBe(401);
  });

  it('лайк фото требует сессии', async () => {
    const { POST } = await import('@/app/api/photos/[photoId]/like/route');
    session.current = null;
    const res = await POST(req(), { params: Promise.resolve({ photoId: 'p1' }) });
    expect(res.status).toBe(401);
  });
});

describe('роуты: валидация входа', () => {
  it('жалоба: мусорный payload → 400, гость без контакта → 400', async () => {
    const { POST } = await import('@/app/api/reports/route');

    session.current = null;
    expect((await POST(req({ targetType: 'НЕТ_ТАКОГО', targetId: 'x', reason: 'SPAM' }))).status).toBe(400);

    // Гостю обязателен контакт для ответа
    const res = await POST(req({ targetType: 'USER', targetId: 'x', reason: 'SPAM' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('contact_required');
  });

  it('заявка: без согласия на обработку ПДн → 400 (152-ФЗ)', async () => {
    const { POST } = await import('@/app/api/inquiries/route');
    const base = {
      contactName: 'Иван Заказчиков',
      contactEmail: 'client@example.com',
      citySlug: 'moscow',
      description: 'Нужна съёмка конференции на 200 человек, два зала',
      website: '',
    };
    const res = await POST(req(base)); // pdnConsent отсутствует
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');

    const res2 = await POST(req({ ...base, pdnConsent: false }));
    expect(res2.status).toBe(400);
  });

  it('подтверждение email: пустой запрос без сессии → 401, битый токен → 400', async () => {
    const { POST } = await import('@/app/api/auth/verify-email/route');

    session.current = null;
    expect((await POST(req({}))).status).toBe(401);

    const res = await POST(req({ token: 'явно-неверный-токен-достаточной-длины' }));
    expect(res.status).toBe(400);
  });
});

describe('роуты: админ-гейт на всех административных эндпоинтах', () => {
  // Снятый по невнимательности гейт на любом из них = утечка PII или
  // возможность модерировать чужой контент. Проверяем ВСЕ разом.
  it('экспорт данных, модерация фото/серий/анкет, инвайты и верификация закрыты от не-админа', async () => {
    const mods = await Promise.all([
      import('@/app/api/admin/export/route'),
      import('@/app/api/admin/moderation/route'),
      import('@/app/api/admin/moderation/photos/route'),
      import('@/app/api/admin/invites/route'),
      import('@/app/api/admin/verify/route'),
      import('@/app/api/admin/stories/route'),
      import('@/app/api/admin/photographers/route'),
      import('@/app/api/admin/photos/[photoId]/editors-choice/route'),
      import('@/app/api/admin/photographers/[id]/grant-pro/route'),
    ]);
    const paramsFor = [undefined, undefined, undefined, undefined, undefined, undefined, undefined, { photoId: 'x' }, { id: 'x' }];

    for (const who of [null, { userId: 'u1', role: 'CLIENT', tokenVersion: 0 }, { userId: 'u2', role: 'PHOTOGRAPHER', tokenVersion: 0 }]) {
      session.current = who;
      for (const [i, mod] of mods.entries()) {
        const handler = (mod as Record<string, unknown>).POST ?? (mod as Record<string, unknown>).PATCH ?? (mod as Record<string, unknown>).GET;
        if (typeof handler !== 'function') continue;
        const p = paramsFor[i];
        const res = (await (handler as (r: Request, ctx?: unknown) => Promise<Response>)(
          req({ status: 'APPROVED' }),
          p ? { params: Promise.resolve(p) } : undefined,
        )) as Response;
        // Любой отказ доступа подходит (403/401), главное — не 200
        expect([401, 403]).toContain(res.status);
      }
    }
  });
});

describe.skipIf(!hasDb)('роуты: раскрытие телефона (БД)', () => {
  it('без опт-ина автора — 404, при опт-ине — номер', async () => {
    const { db } = await import('@/lib/db');
    const { POST } = await import('@/app/api/profiles/[profileId]/phone/route');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const phone = `+7999${String(Date.now()).slice(-7)}`;
    const owner = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Р', lastName: 'Оут', email: `rt-${stamp}@test.local`, phone },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `rt-${stamp}`, cityId: city.id, status: 'APPROVED', showPhone: false },
    });
    const params = Promise.resolve({ profileId: profile.id });

    session.current = null;
    expect((await POST(req(undefined), { params })).status).toBe(404);

    await db.photographerProfile.update({ where: { id: profile.id }, data: { showPhone: true } });
    const ok = await POST(req(undefined), { params: Promise.resolve({ profileId: profile.id }) });
    expect(ok.status).toBe(200);
    expect((await ok.json()).phone).toBe(phone);

    await db.activityEvent.deleteMany({ where: { targetId: profile.id } });
    await db.rateLimit.deleteMany({ where: { key: { contains: profile.id } } });
    await db.profileCategoryScore.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.delete({ where: { id: owner.id } });
  });
});

// Фоновые задачи ходят по секрету, а не по сессии: воркер транскода живёт
// эндпоинтом, и открытая дверь к нему означала бы, что любой прохожий может
// занять процессор VM транскодом.
describe('роуты: фоновые задачи защищены секретом', () => {
  const jobReq = (auth?: string) =>
    new Request('http://localhost/api/jobs/video', {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
    });

  it('воркер видео не открывается без секрета и с чужим секретом', async () => {
    const { POST } = await import('@/app/api/jobs/video/route');
    const saved = process.env.JOBS_SECRET;
    process.env.JOBS_SECRET = 'jobs-ok-1';
    try {
      expect((await POST(jobReq())).status).toBe(403);
      expect((await POST(jobReq('Bearer jobs-bad-1'))).status).toBe(403);
      // Короткий токен не должен ронять сравнение на разной длине
      expect((await POST(jobReq('Bearer x'))).status).toBe(403);
    } finally {
      if (saved === undefined) delete process.env.JOBS_SECRET;
      else process.env.JOBS_SECRET = saved;
    }
  });

  it('без настроенного секрета роут закрыт полностью, а не открыт всем', async () => {
    const { POST } = await import('@/app/api/jobs/video/route');
    const saved = process.env.JOBS_SECRET;
    delete process.env.JOBS_SECRET;
    try {
      expect((await POST(jobReq('Bearer anything'))).status).toBe(403);
      expect((await POST(jobReq())).status).toBe(403);
    } finally {
      if (saved !== undefined) process.env.JOBS_SECRET = saved;
    }
  });
});

// Импорт по ссылке даёт пользователю возможность заставить НАШ сервер сходить
// по произвольному адресу. Гард живёт в библиотеке и покрыт отдельно; здесь
// проверяется, что роут вообще его вызывает и не открыт посторонним.
describe('роуты: импорт портфолио по ссылке', () => {
  it('разведка и перенос требуют сессии фотографа', async () => {
    const { GET, POST } = await import('@/app/api/profile/import/route');
    session.current = null;
    expect((await GET(new Request('http://localhost/api/profile/import?url=https://example.com'))).status).toBe(401);
    expect((await POST(req({ urls: ['https://example.com/a.jpg'], categorySlug: 'sports' }))).status).toBe(401);
  });

  it('внутренние адреса отвергаются самим роутом, а не «где-то ниже»', async () => {
    if (!hasDb) return;
    const { db } = await import('@/lib/db');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const user = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'И', lastName: 'П', email: `imp-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: user.id, username: `imp-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    session.current = { userId: user.id, role: 'PHOTOGRAPHER', tokenVersion: 0 };

    try {
      const { GET } = await import('@/app/api/profile/import/route');
      const res = await GET(new Request('http://localhost/api/profile/import?url=http://169.254.169.254/latest/meta-data/'));
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'import_blocked_host' });
    } finally {
      await db.photographerProfile.delete({ where: { id: profile.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });
});
