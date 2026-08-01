import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_VIDEO_BYTES } from '@/lib/videos';

// Лимиты периметра и приложения должны сходиться (аудит 2026-08-01, P2).
//
// nginx резал тело на 45 МБ, а приложение обещало 200 МБ — фича загрузки видео
// была мертва на проде, причём молча: запрос обрывался на периметре, автор
// видел голый HTML-413, а в логах приложения не было вообще ничего. Это класс
// ошибок «два источника правды в разных репо-слоях», который никакой тест
// раньше не покрывал. Здесь сверяем конфиг nginx с константой в коде.

const setupScript = readFileSync(path.join(process.cwd(), 'deploy/setup-server.sh'), 'utf8');

function limitMb(block: string): number | null {
  const m = block.match(/client_max_body_size\s+(\d+)m/);
  return m ? Number(m[1]) : null;
}

describe('лимиты загрузки: nginx и приложение согласованы', () => {
  it('на роут видео nginx пропускает не меньше, чем разрешает приложение', () => {
    const videoLocation = setupScript.slice(
      setupScript.indexOf('location = /api/profile/videos'),
      setupScript.indexOf('location /', setupScript.indexOf('location = /api/profile/videos') + 10),
    );
    const nginxMb = limitMb(videoLocation);
    expect(nginxMb, 'в блоке /api/profile/videos нет client_max_body_size').not.toBeNull();

    const appMb = MAX_VIDEO_BYTES / 1024 / 1024;
    // Запас нужен на заголовки и округление; хватит и пары мегабайт
    expect(nginxMb!).toBeGreaterThanOrEqual(appMb + 2);
  });

  it('тело видео не буферизуется nginx целиком перед передачей в приложение', () => {
    // Без этого 200 МБ сначала лягут на диск VM, и только потом поедут в Node —
    // удвоенная задержка и рост /var на каждой загрузке.
    expect(setupScript).toContain('proxy_request_buffering off');
  });

  it('общий лимит остаётся умеренным — 210m не должен растекаться на все роуты', () => {
    const rootLocation = setupScript.slice(setupScript.indexOf("    location / {"));
    const rootMb = limitMb(rootLocation);
    expect(rootMb).not.toBeNull();
    expect(rootMb!).toBeLessThan(100);
  });
});
