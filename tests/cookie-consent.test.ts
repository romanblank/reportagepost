import { describe, expect, it } from 'vitest';

// Согласие на cookie должно быть доказуемым и уважаемым (аудит 2026-08-01, P2).
//
// Раньше: отказаться нельзя (одна кнопка), факт согласия только в localStorage
// (доказать невозможно — баннер для вида), а beacon просмотров профиля работал
// независимо от решения человека. РКН устойчиво трактует cookie вместе с IP
// как персональные данные.

describe('cookie: решение фиксируется на сервере и влияет на трекинг', () => {
  it('роут ставит cookie с версией политики', async () => {
    const { POST } = await import('@/app/api/cookie-consent/route');
    const { PDN_CONSENT_VERSION } = await import('@/lib/constants');

    const res = await POST(new Request('http://localhost/api/cookie-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analytics: true }),
    }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('rp_consent=all');
    // Версия в значении: при новой редакции политики согласие переспрашивается,
    // а не наследуется молча.
    expect(setCookie).toContain(PDN_CONSENT_VERSION);
  });

  it('отказ тоже фиксируется — молчание согласием не считается', async () => {
    const { POST } = await import('@/app/api/cookie-consent/route');
    const res = await POST(new Request('http://localhost/api/cookie-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analytics: false }),
    }));
    expect(res.headers.get('set-cookie') ?? '').toContain('rp_consent=necessary');
  });

  it('beacon просмотра не считает просмотр без согласия на аналитику', async () => {
    const { POST } = await import('@/app/api/profile-view/route');

    const call = (cookie: string) =>
      POST(new Request('http://localhost/api/profile-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ profileId: 'нет-такого' }),
      }));

    // Без решения и при отказе — просмотр не учитываем (до всякой работы с БД)
    for (const cookie of ['', 'rp_consent=necessary:2026-07-15']) {
      const res = await call(cookie);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ counted: false });
    }
  });
});
