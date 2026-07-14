import { NextResponse } from 'next/server';
import { handleTelegramUpdate } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

// Вебхук Telegram. Подлинность — по секрету, который Telegram шлёт в заголовке
// (мы задаём его в setWebhook). Без совпадения — 401 (антиспуфинг).
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false }, { status: 503 });
  if (req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
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
