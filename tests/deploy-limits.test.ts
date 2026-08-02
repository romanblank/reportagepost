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

// Сетевые лимиты запросов (S0). Проверяем не «текст есть», а связность: каждая
// зона, на которую ссылается limit_req, должна быть объявлена, и каждый
// location — проксировать в приложение. Location без proxy_pass отдаёт 404
// молча, и целый раздел сайта исчезает после ближайшего деплоя.
describe('nginx: лимиты запросов на периметре', () => {
  const declared = new Set(
    [...setupScript.matchAll(/limit_req_zone[^;]*zone=(\w+):/g)].map((m) => m[1]),
  );
  const used = [...setupScript.matchAll(/limit_req\s+zone=(\w+)/g)].map((m) => m[1]);

  it('каждая используемая зона объявлена', () => {
    expect(used.length).toBeGreaterThan(0);
    for (const zone of used) expect(declared, `зона ${zone} не объявлена`).toContain(zone);
  });

  it('вход ограничен строже, чем обычные страницы', () => {
    const rate = (zone: string) => {
      const m = setupScript.match(new RegExp(`zone=${zone}:[^;]*rate=(\\d+)r/s`));
      return m ? Number(m[1]) : null;
    };
    const auth = rate('rp_auth');
    const general = rate('rp_general');
    expect(auth).not.toBeNull();
    expect(general).not.toBeNull();
    expect(auth!).toBeLessThan(general!);
  });

  it('раздача медиа щедрее страниц — иначе обычный просмотр каталога упрётся в лимит', () => {
    const files = setupScript.match(/zone=rp_files:[^;]*rate=(\d+)r\/s/);
    const general = setupScript.match(/zone=rp_general:[^;]*rate=(\d+)r\/s/);
    expect(Number(files![1])).toBeGreaterThan(Number(general![1]));
  });

  it('каждый location проксирует в приложение', () => {
    const blocks = [...setupScript.matchAll(/location ([^{]+)\{([^}]*)\}/g)];
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const [, head, body] of blocks) {
      // Служебные блоки certbot и редиректа на https проксировать не должны
      if (head.includes('acme-challenge') || body.includes('return 301')) continue;
      expect(body, `location без proxy_pass: ${head.trim()}`).toContain('proxy_pass');
    }
  });

  it('превышение лимита отдаётся как 429, а не как поломка сервера', () => {
    expect(setupScript).toContain('limit_req_status 429');
  });
});

// Харденинг ssh — единственный канал доступа к VM (сеть оператора к YC закрыта).
describe('sshd: защита от переполнения слотов подключений', () => {
  it('ограничены недоаутентифицированные соединения и попытки входа', () => {
    expect(setupScript).toMatch(/MaxStartups\s+\d+:\d+:\d+/);
    expect(setupScript).toMatch(/PerSourceMaxStartups\s+\d+/);
    expect(setupScript).toMatch(/MaxAuthTries\s+\d+/);
    expect(setupScript).toContain('PasswordAuthentication no');
  });

  it('конфиг применяется только после проверки sshd -t и откатывается при отказе', () => {
    // Иначе неподдерживаемая директива оставит машину без доступа навсегда:
    // другого пути на VM нет.
    expect(setupScript).toContain('sshd -t');
    expect(setupScript).toMatch(/rm -f "\$SSHD_DROPIN"/);
  });
});

// Smoke после деплоя: /health трогает только базу и отвечает 200 при падающем
// каталоге. Стражем проверяем, что smoke не выродится в проверку одной главной
// и что он смотрит КОДЫ ответа — grep по разметке на SSR-стриминге находит
// шапку и на битой странице (ложная зелень маскировала сломанный профиль).
describe('пост-деплой smoke', () => {
  const smoke = readFileSync(path.join(process.cwd(), 'deploy/smoke.sh'), 'utf8');

  it('покрывает живые разделы, а не только главную', () => {
    for (const route of ['/ru/russia/moscow', '/ru/match', '/ru/pro', '/ru/login', '/ru/register']) {
      expect(smoke, `smoke не проверяет ${route}`).toContain(`"${route}"`);
    }
  });

  it('стережёт честный 404 — регрессия soft-404 отдавала 200', () => {
    expect(smoke).toMatch(/nowhere" 404/);
    expect(smoke).toMatch(/no-such-author[^"]*" 404/);
  });

  it('проверяет коды ответа, а не разметку', () => {
    expect(smoke).toContain('%{http_code}');
    expect(smoke).not.toMatch(/curl[^|]*\|\s*grep/);
  });

  it('провал smoke — это ненулевой код возврата, иначе деплой не откатится', () => {
    expect(smoke).toMatch(/exit 1/);
  });

  it('деплой вызывает smoke и откатывается при его провале', () => {
    const deploy = readFileSync(path.join(process.cwd(), '.github/workflows/deploy.yml'), 'utf8');
    expect(deploy).toContain('./smoke.sh');
    // Без chmod скрипт не запустится на свежей машине
    expect(deploy).toMatch(/chmod \+x[^\n]*smoke\.sh/);
  });
});
