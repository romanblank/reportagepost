import { describe, expect, it } from 'vitest';
import { describeApiError } from '@/lib/form-errors';

// Мок Response: только нужные поля (status + json()).
const res = (status: number, body: unknown): Response =>
  ({ status, json: async () => body }) as unknown as Response;

describe('form-errors.describeApiError — разбор ответа API в текст', () => {
  it('нет ответа → про связь', async () => {
    expect(await describeApiError(null, { fallback: 'x' })).toContain('связ');
  });

  it('429 → про попытки (независимо от тела)', async () => {
    expect(await describeApiError(res(429, {}), { fallback: 'x' })).toContain('Слишком много');
  });

  it('доменный код через codeLabels', async () => {
    const msg = await describeApiError(res(409, { error: 'email_taken' }), {
      codeLabels: { email_taken: 'Этот email уже занят' },
      fallback: 'x',
    });
    expect(msg).toBe('Этот email уже занят');
  });

  it('validation + details → «Проверьте поля» с лейблами', async () => {
    const msg = await describeApiError(
      res(400, { error: 'validation', details: { username: ['слишком короткий'] } }),
      { fieldLabels: { username: 'адрес страницы' }, fallback: 'x' },
    );
    expect(msg).toContain('Проверьте поля');
    expect(msg).toContain('адрес страницы: слишком короткий');
  });

  it('body.message пробрасывается', async () => {
    expect(await describeApiError(res(400, { message: 'Конкретная ошибка' }), { fallback: 'x' })).toBe('Конкретная ошибка');
  });

  it('иначе — fallback', async () => {
    expect(await describeApiError(res(500, {}), { fallback: 'Резерв' })).toBe('Резерв');
    expect(await describeApiError(res(400, null), { fallback: 'Резерв' })).toBe('Резерв');
  });
});
