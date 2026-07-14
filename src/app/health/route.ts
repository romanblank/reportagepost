import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Честный health (урок 2026-07-13: без проверки БД деплой был «зелёным»
// при мёртвом TLS к PostgreSQL): проверяем реальный запрос к базе.
export async function GET() {
  const version = (process.env.APP_VERSION ?? 'dev').slice(0, 7);
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', app: 'reportage-post', db: 'ok', version });
  } catch {
    return NextResponse.json(
      { status: 'degraded', app: 'reportage-post', db: 'unreachable', version },
      { status: 503 },
    );
  }
}
