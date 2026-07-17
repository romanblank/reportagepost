import { describe, expect, it, beforeEach, afterEach } from 'vitest';

describe('yandex-oauth: построение auth-URL и флаги конфигурации', () => {
  const prevId = process.env.YANDEX_CLIENT_ID;
  const prevSecret = process.env.YANDEX_OAUTH_SECRET;
  beforeEach(() => { delete process.env.YANDEX_CLIENT_ID; delete process.env.YANDEX_OAUTH_SECRET; });
  afterEach(() => {
    if (prevId === undefined) delete process.env.YANDEX_CLIENT_ID; else process.env.YANDEX_CLIENT_ID = prevId;
    if (prevSecret === undefined) delete process.env.YANDEX_OAUTH_SECRET; else process.env.YANDEX_OAUTH_SECRET = prevSecret;
  });

  it('yandexStartConfigured нужен только ClientID; yandexOAuthConfigured — оба', async () => {
    const m = await import('@/lib/yandex-oauth');
    expect(m.yandexStartConfigured()).toBe(false);
    expect(m.yandexOAuthConfigured()).toBe(false);
    process.env.YANDEX_CLIENT_ID = 'abc123';
    expect(m.yandexStartConfigured()).toBe(true);
    expect(m.yandexOAuthConfigured()).toBe(false); // нет секрета
    process.env.YANDEX_OAUTH_SECRET = 'sss';
    expect(m.yandexOAuthConfigured()).toBe(true);
  });

  it('buildAuthUrl содержит обязательные параметры code-flow', async () => {
    process.env.YANDEX_CLIENT_ID = 'abc123';
    const { buildAuthUrl } = await import('@/lib/yandex-oauth');
    const url = new URL(buildAuthUrl('state-xyz'));
    expect(url.origin + url.pathname).toBe('https://oauth.yandex.ru/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('abc123');
    expect(url.searchParams.get('state')).toBe('state-xyz');
    expect(url.searchParams.get('redirect_uri')).toBe('https://reportagepost.com/api/auth/yandex/callback');
    expect(url.searchParams.get('scope')).toContain('login:email');
  });
});
