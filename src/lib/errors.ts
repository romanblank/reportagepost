import { NextResponse } from 'next/server';

// Единый слой доменных ошибок (аудит P1-7): доменные исключения несут .code и
// http-статус; всё прочее пробрасывается (не глотать — правило проекта).
export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export function jsonError(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

/**
 * Оборачивает тело роута: DomainError → {error, status}; остальное логируется
 * и отдаётся как 500 (внутренние детали наружу не текут — фикс sec #12).
 */
export async function handleRoute(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DomainError) return jsonError(e.code, e.status);
    console.error('[api] unhandled error:', e);
    return jsonError('internal', 500);
  }
}
