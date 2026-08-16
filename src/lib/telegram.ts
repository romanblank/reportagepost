import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';

// Telegram-бот уведомлений (S2). Провайдер за абстракцией: без TELEGRAM_BOT_TOKEN
// всё — тихий no-op (как sms/storage/email). Секрет вебхука проверяется в роуте.

const API = 'https://api.telegram.org';

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

/** Отправка сообщения в чат. Ошибки НЕ роняют основной поток (уведомление — не критично). */
export async function tgSend(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      // БЕЗ parse_mode: сообщения — plain text (email-версия тоже plain). HTML-режим
      // допускал инъекцию ссылок/подделку через пользовательский excerpt заявки и
      // молчаливую потерю уведомления на невалидном HTML (аудит 2026-07-28, P2).
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch {
    // сеть/Telegram недоступны — уведомление теряем, поток не рушим
  }
}

let cachedUsername: string | null = null;
async function botUsername(): Promise<string | null> {
  if (cachedUsername) return cachedUsername;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${API}/bot${token}/getMe`, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();
    cachedUsername = data?.result?.username ?? null;
    return cachedUsername;
  } catch {
    return null;
  }
}

/**
 * Старт привязки: генерируем одноразовый код, кладём на пользователя, возвращаем
 * deep-link. Пользователь жмёт → бот получает /start <код> → привязка (webhook).
 */
export async function startTelegramLink(userId: string): Promise<{ url: string } | null> {
  const username = await botUsername();
  if (!username) return null;
  const code = randomBytes(9).toString('base64url');
  await db.user.update({ where: { id: userId }, data: { tgLinkCode: code } });
  return { url: `https://t.me/${username}?start=${code}` };
}

// Минимальная форма Telegram update, что нам нужна.
interface TgUpdate {
  message?: { chat?: { id?: number | string }; text?: string };
}

/**
 * Обработка входящего апдейта (после проверки секрета в роуте). Тестируемо
 * отдельно. Команды: /start <код> — привязка; /stop — отвязка.
 */
export async function handleTelegramUpdate(update: TgUpdate): Promise<void> {
  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim();
  if (chatId == null || !text) return;
  const chat = String(chatId);

  if (text.startsWith('/start')) {
    const code = text.slice('/start'.length).trim();
    if (!code) {
      await tgSend(chat, 'Откройте привязку в кабинете Репортаж Пост и нажмите кнопку — я свяжу аккаунт.');
      return;
    }
    const user = await db.user.findUnique({ where: { tgLinkCode: code }, select: { id: true } });
    if (!user) {
      await tgSend(chat, 'Код привязки не найден или устарел. Сгенерируйте новый в кабинете.');
      return;
    }
    await db.user.update({ where: { id: user.id }, data: { tgUserId: chat, tgLinkCode: null } });
    await tgSend(chat, 'Готово — уведомления Репортаж Пост будут приходить сюда. Отвязать: /stop');
    return;
  }

  if (text.startsWith('/stop')) {
    const res = await db.user.updateMany({ where: { tgUserId: chat }, data: { tgUserId: null } });
    if (res.count > 0) await tgSend(chat, 'Отвязано. Уведомления больше не приходят.');
    return;
  }
}

/** Уведомление пользователю в Telegram, если он привязан. */
export async function notifyTelegram(userId: string, text: string): Promise<void> {
  if (!telegramConfigured()) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { tgUserId: true } });
  if (user?.tgUserId) await tgSend(user.tgUserId, text);
}

/**
 * Сообщение оператору в служебный чат (тот же, куда пишут watchdog и бэкапы).
 *
 * Нужен для поломок, о которых иначе никто не узнает: интеграция, устроенная
 * как тихий no-op, снаружи неотличима от работающей. Без настроенного чата —
 * обычный no-op, как и всё остальное.
 */
export async function alertOperator(text: string): Promise<void> {
  const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
  if (!chat) return;
  await tgSend(chat, text);
}
