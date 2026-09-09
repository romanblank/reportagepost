import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { handleTelegramUpdate } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

// Вебхук Telegram. Подлинность — по секрету, который Telegram шлёт в заголовке
// (мы задаём его в setWebhook). Без совпадения — 401 (антиспуфинг).
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false }, { status: 503 });
  // Constant-time, как у jobs-роутов: обычное !== в теории отдаёт длину
  // совпавшего префикса таймингом (аудит 2026-09-10, П3 — единообразие)
  const got = Buffer.from(req.headers.get('x-telegram-bot-api-secret-token') ?? '');
  const want = Buffer.from(secret);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  if (update) {
    // Ошибки обработки не должны заставлять Telegram ретраить бесконечно — глушим,
    // всегда отвечаем 200 (кроме неверного секрета выше).
    try {
      await handleTelegramUpdate(update);
    } catch (e) {
      console.error('[telegram] update error:', e);
    }
  }
  return NextResponse.json({ ok: true });
}
