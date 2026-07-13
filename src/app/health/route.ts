import { NextResponse } from 'next/server';

// Критерий S0: /health отвечает 200 с прода. Позже добавит проверку БД.
export function GET() {
  return NextResponse.json({ status: 'ok', app: 'reportage-post' });
}
