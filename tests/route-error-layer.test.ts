import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Единый слой ошибок в роутах (аудит 2026-08-01, P2).
//
// Слой (handleRoute + DomainError) был объявлен и покрывал 2/3 роутов; остальные
// ловили свои классы исключений и лепили статусы вручную. Побочный эффект был
// хуже дублирования: `try { await rateLimit() } catch { 429 }` ловил ЛЮБУЮ
// ошибку, включая недоступность БД, — инцидент приходил к клиенту как штатное
// «слишком много попыток» и не отличался от него в мониторинге.
//
// Главная беда такого расхождения — самовоспроизводство: новый роут пишется
// копипастой соседнего. Поэтому здесь не разовая уборка, а страж.

const API_DIR = path.join(process.cwd(), 'src/app/api');

// Обоснованные исключения: эти роуты по своей природе не отвечают JSON-ошибкой,
// и общий обработчик сломал бы их контракт с внешней стороной.
const EXEMPT = new Map<string, string>([
  ['tinkoff/webhook/route.ts', 'вебхук обязан отвечать строго текстом "OK", иначе Т-Касса ретраит'],
  ['stream/route.ts', 'SSE: ответ — бесконечный поток, а не единичный NextResponse'],
  ['auth/logout/route.ts', 'только сброс cookie, доменных ошибок нет'],
  ['auth/yandex/start/route.ts', 'отвечает редиректом в провайдера'],
  ['auth/yandex/callback/route.ts', 'отвечает редиректом, ошибки уводят на страницу входа'],
  ['auth/yandex/complete/route.ts', 'отвечает редиректом'],
  ['telegram/route.ts', 'вебхук Telegram: любой не-200 вызывает переотправку апдейта'],
]);

function routeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, acc);
    else if (entry === 'route.ts') acc.push(full);
  }
  return acc;
}

const routes = routeFiles(API_DIR).map((full) => ({
  rel: path.relative(API_DIR, full).split(path.sep).join('/'),
  src: readFileSync(full, 'utf8'),
}));

describe('роуты: единый слой ошибок', () => {
  it('каждый JSON-роут обёрнут в handleRoute (или явно и обоснованно исключён)', () => {
    const missing = routes
      .filter((r) => !EXEMPT.has(r.rel))
      .filter((r) => !r.src.includes('handleRoute'))
      .map((r) => r.rel);
    expect(
      missing,
      `роуты без handleRoute — необработанная ошибка уйдёт клиенту без кода и мимо алерта: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('ни один роут не глушит rate-limit пустым catch', () => {
    // Пустой catch вокруг лимита превращает падение БД в 429. Где ответ при
    // лимите намеренно нештатный (forgot-password отдаёт 200, чтобы нельзя было
    // перебирать адреса), ошибка должна разбираться по коду, а не гаситься вся.
    const offenders = routes
      .filter((r) => /await rateLimit\([^)]*\);\s*\n\s*\} catch \{/.test(r.src))
      .map((r) => r.rel);
    expect(
      offenders,
      `пустой catch вокруг rateLimit маскирует падение БД под «слишком много попыток»: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('список исключений не разрастается молча', () => {
    // Каждое исключение объяснено строкой-причиной; сам список фиксирован —
    // добавление нового потребует осознанной правки теста.
    for (const [file, reason] of EXEMPT) {
      expect(reason.length, `исключение ${file} без объяснения`).toBeGreaterThan(10);
      expect(routes.some((r) => r.rel === file), `исключение ${file} указывает на несуществующий роут`).toBe(true);
    }
    expect(EXEMPT.size).toBeLessThanOrEqual(8);
  });
});
