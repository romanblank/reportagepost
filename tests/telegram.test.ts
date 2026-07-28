import { describe, expect, it, vi } from 'vitest';
import 'dotenv/config';
import { telegramConfigured, notifyTelegram, tgSend } from '@/lib/telegram';

describe('telegram: plain-text (анти HTML-инъекция, аудит 2026-07-28)', () => {
  it('tgSend НЕ шлёт parse_mode → пользовательский текст не парсится как HTML', async () => {
    const prev = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    let body: { parse_mode?: string; text?: string } | null = null;
    const fetchMock = vi.fn(async (_url: string, opts: { body: string }) => {
      body = JSON.parse(opts.body);
      return { ok: true } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await tgSend('123', 'заявка <a href="evil">клик</a> & <b>x</b>');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(body!.parse_mode).toBeUndefined(); // нет HTML-режима — инъекция невозможна
      expect(body!.text).toContain('<a href="evil">'); // текст как есть, не интерпретируется
    } finally {
      vi.unstubAllGlobals();
      if (prev !== undefined) process.env.TELEGRAM_BOT_TOKEN = prev;
      else delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });
});

describe('telegram: no-op без токена', () => {
  it('telegramConfigured=false и notifyTelegram не бросает без ключа', async () => {
    const prev = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(telegramConfigured()).toBe(false);
    await expect(notifyTelegram('nobody', 'привет')).resolves.toBeUndefined();
    if (prev !== undefined) process.env.TELEGRAM_BOT_TOKEN = prev;
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('telegram: привязка по /start, отвязка /stop (БД)', () => {
  it('/start <код> связывает chat_id и гасит код; чужой код — нет; /stop отвязывает', async () => {
    const { db } = await import('@/lib/db');
    const { handleTelegramUpdate } = await import('@/lib/telegram');
    // без токена tgSend — no-op, сеть не дёргается
    const prev = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const code = `code-${stamp}`;
    const user = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Т', lastName: 'Г', email: `tg-${stamp}@test.local`, tgLinkCode: code } });

    // неверный код — не привязывает
    await handleTelegramUpdate({ message: { chat: { id: 999 }, text: '/start wrong-code' } });
    let u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.tgUserId).toBeNull();

    // верный код — привязка, код гаснет
    await handleTelegramUpdate({ message: { chat: { id: 555 }, text: `/start ${code}` } });
    u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.tgUserId).toBe('555');
    expect(u.tgLinkCode).toBeNull();

    // /stop отвязывает по chat_id
    await handleTelegramUpdate({ message: { chat: { id: 555 }, text: '/stop' } });
    u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.tgUserId).toBeNull();

    await db.user.delete({ where: { id: user.id } });
    if (prev !== undefined) process.env.TELEGRAM_BOT_TOKEN = prev;
  });
});
