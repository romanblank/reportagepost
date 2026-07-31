import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { tgSend } from '@/lib/telegram';

// Доставка рантайм-ошибок оператору (аудит 2026-07-31, P1: видимость была нулевой).
// Логи живут в контейнере с ротацией 10m×5 и оператору по SSH недоступны, поэтому
// 500-ка у приглашённого фотографа могла прожить недели незамеченной — в CLAUDE.md
// уже задокументирован случай, когда битый профиль пережил пять деплоев.
//
// Почему не Sentry: внешний сервис — ещё одна интеграция и ещё один секрет ради
// одного соло-оператора, у которого уже есть работающий канал (Telegram-бот).
// Если объём вырастет — заменить отправку внутри этой функции, вызовы не изменятся.
//
// АНТИСПАМ ОБЯЗАТЕЛЕН: падающая страница генерирует ошибку на каждый заход.
// Дедупим по отпечатку (место + сообщение) в окне DEDUP_MIN через ту же таблицу
// RateLimit — первое срабатывание в окне шлём, остальные молча считаем.

const DEDUP_MIN = 30;

function fingerprint(where: string, message: string): string {
  // Числа выкидываем: id/таймстемпы в сообщении иначе ломают дедуп
  const normalized = message.replace(/\d+/g, '#').slice(0, 200);
  return createHash('sha256').update(`${where}|${normalized}`).digest('hex').slice(0, 16);
}

async function firstInWindow(key: string): Promise<boolean> {
  const windowMs = DEDUP_MIN * 60_000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  try {
    const row = await db.rateLimit.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });
    return row.count === 1;
  } catch {
    return false; // не можем посчитать — лучше промолчать, чем спамить
  }
}

/**
 * Сообщить об ошибке. Никогда не бросает и не ждёт долго — вызывается из
 * обработчиков, где падение репортера было бы хуже самой ошибки.
 */
export async function reportError(where: string, error: unknown, extra?: string): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
    // В логах контейнера остаётся всегда — даже когда алерты не настроены
    console.error(`[error] ${where}:`, message, extra ?? '');
    if (!chat) return;

    if (!(await firstInWindow(`err:${fingerprint(where, message)}`))) return;

    const stack = error instanceof Error && error.stack ? error.stack.split('\n').slice(1, 4).join('\n') : '';
    await tgSend(
      chat,
      `🔴 Ошибка на проде\n\nГде: ${where}\n${extra ? `Что: ${extra}\n` : ''}Сообщение: ${message}\n${stack}\n\nПовторы за ${DEDUP_MIN} мин не дублируются.`,
    );
  } catch {
    // репортер не имеет права ломать вызывающий код
  }
}
