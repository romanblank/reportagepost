import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { emailConfigured } from '@/lib/email';
import { telegramConfigured } from '@/lib/telegram';
import { getPremoderationProvider } from '@/lib/premoderation';

// Честный health (урок 2026-07-13: без проверки БД деплой был «зелёным»
// при мёртвом TLS к PostgreSQL): проверяем реальный запрос к базе.
//
// Плюс состояние интеграций (2026-08-03). Все они устроены как тихий no-op без
// ключей — это правильно для кода, но снаружи «письма не приходят» неотличимо
// от «письма отправляются и теряются». Тот же класс, что бэкапы-пустышки:
// молчание читается как «всё хорошо». Значения ключей не раскрываются — только
// факт наличия конфигурации.
export async function GET() {
  const version = (process.env.APP_VERSION ?? 'dev').slice(0, 7);
  const integrations = {
    mail: emailConfigured() ? 'on' : 'off',
    storage: process.env.S3_BUCKET ? 's3' : 'disk',
    telegram: telegramConfigured() ? 'on' : 'off',
    vision: getPremoderationProvider() ? 'on' : 'off',
  };
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', app: 'reportage-post', db: 'ok', version, integrations });
  } catch {
    return NextResponse.json(
      { status: 'degraded', app: 'reportage-post', db: 'unreachable', version, integrations },
      { status: 503 },
    );
  }
}
