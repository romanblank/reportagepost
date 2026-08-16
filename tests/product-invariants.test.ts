import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Продуктовые инварианты, проверявшиеся только глазами (аудит 2026-08-01, P2).
//
// Два правила из CLAUDE.md — «строки UI только из словаря» и «запрещены
// слова-геткиперы» — не были исполняемыми: их соблюдение держалось на внимании
// при ревью. Такие правила ломаются молча и обнаруживаются на проде.

const SRC = path.join(process.cwd(), 'src');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

// Зона инварианта — интерфейс: компоненты и страницы/роуты. Модули данных и
// нормативные тексты сюда не входят и не должны: справочник городов, названия
// жанров, месяцы, юридические документы, промпт модели, тексты Telegram-бота и
// сообщения-диагностика для разработчика — это не строки интерфейса, а
// содержимое. Бренд-имя живёт одной константой APP_NAME.
const EXEMPT_DIRS = [`${path.sep}i18n${path.sep}`, `${path.sep}lib${path.sep}`];
const EXEMPT_FILES = new Set(['src/components/BrandLockup.tsx']); // начертание имени бренда

const files = walk(SRC)
  .filter((f) => !EXEMPT_DIRS.some((d) => f.includes(d)))
  .map((f) => ({ rel: path.relative(process.cwd(), f).split(path.sep).join('/'), src: readFileSync(f, 'utf8') }))
  .filter((f) => !EXEMPT_FILES.has(f.rel));

// Строка кода без комментариев — комментарии по-русски это норма и польза
function codeLines(src: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of src.split('\n')) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) continue;
      line = line.slice(end + 2);
      inBlock = false;
    }
    const block = line.indexOf('/*');
    if (block !== -1) {
      const end = line.indexOf('*/', block);
      if (end === -1) { inBlock = true; line = line.slice(0, block); }
      else line = line.slice(0, block) + line.slice(end + 2);
    }
    const slash = line.indexOf('//');
    if (slash !== -1) line = line.slice(0, slash);
    // JSX-комментарии {/* ... */} уже сняты блочным разбором выше
    out.push(line);
  }
  return out;
}

describe('инвариант: строки интерфейса живут только в словаре', () => {
  it('в компонентах и страницах нет русских строковых литералов', () => {
    const offenders: string[] = [];
    for (const { rel, src } of files) {
      codeLines(src).forEach((line, i) => {
        // Литерал в кавычках или бэктиках, содержащий кириллицу
        const m = line.match(/(['"`])[^'"`]*[А-Яа-яЁё][^'"`]*\1/);
        if (m) offenders.push(`${rel}:${i + 1} → ${m[0].trim().slice(0, 60)}`);
      });
    }
    expect(
      offenders,
      `зашитые строки UI (должны быть в src/i18n):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('инвариант: голос платформы без слов-геткиперов', () => {
  it('в словаре нет слов, делящих людей на своих и чужих', () => {
    // Список из CLAUDE.md (design-record «доброжелательный рейтинг»): эти слова
    // превращают сообщество в отбор, а платформу — в привратника.
    const banned = ['витрин', 'цех', 'отбор', 'планк', 'элит'];
    const dict = readFileSync(path.join(SRC, 'i18n/ru.ts'), 'utf8');
    const found: string[] = [];
    for (const line of dict.split('\n')) {
      const code = line.split('//')[0];
      for (const word of banned) {
        // Ищем в значениях строк, а не в ключах и комментариях
        const inString = code.match(new RegExp(`(['"\`])[^'"\`]*${word}[^'"\`]*\\1`, 'i'));
        if (inString) found.push(`${word}: ${inString[0].slice(0, 70)}`);
      }
    }
    expect(found, `слова-геткиперы в словаре:\n${found.join('\n')}`).toEqual([]);
  });
});

/**
 * Типо-роли вместо зашитых размеров у заголовков.
 *
 * Инвариант спеки дизайна: `.t-display / .t-h1 / .t-h2 / .t-title` существуют
 * именно для того, чтобы шрифтовая система была одна. Однажды ребрендинг уже
 * вернули на доработку ровно из-за этого: новый шрифт прилепили инлайном
 * поверх старой вёрстки, типо-роли на профиле не использовались ни разу, и
 * оператор увидел это с первого взгляда — «ты только тему поменял».
 *
 * Проверка структурная: у заголовка не должно быть собственного text-размера.
 */
describe('инвариант: заголовки используют типо-роли, а не зашитые размеры', () => {
  it('ни один h1/h2/h3 не задаёт размер шрифта вручную', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const path = await import('node:path');

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.tsx')) files.push(full);
      }
    };
    walk(path.join(process.cwd(), 'src'));

    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      // Разбираем ИМЕННО открывающий тег заголовка (он может занимать
      // несколько строк), а не соседние строки: абзац под заголовком имеет
      // полное право на свой размер
      for (const m of src.matchAll(/<h[123]\b([^>]*)>/g)) {
        const cls = m[1].match(/className="([^"]*)"/)?.[1] ?? '';
        if (/\btext-(xs|sm|base|lg|xl|\dxl|\[)/.test(cls)) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${path.relative(process.cwd(), file)}:${line} → ${cls.slice(0, 60)}`);
        }
      }
    }

    expect(
      offenders,
      `заголовки с зашитым размером (используйте .t-display/.t-h1/.t-h2/.t-title):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

/**
 * `user: true` на публичных страницах запрещён (аудит 2026-08-16): полный
 * объект User несёт passwordHash, totpSecret, tokenVersion — одна передача
 * `{...profile.user}` в client-компонент вывезла бы их в RSC-payload прямо в
 * HTML. Явный select делает утечку невозможной по построению. Админка
 * исключена: она за гейтом, и ей полный объект бывает нужен.
 */
describe('публичные страницы: только явный select полей User', () => {
  it('в src/app/ru вне /admin нет include user:true', async () => {
    const { execSync } = await import('node:child_process');
    const out = execSync(
      String.raw`grep -rn "user: true" src/app/ru --include='*.tsx' --include='*.ts' | grep -v "/admin/" || true`,
      { encoding: 'utf8', cwd: process.cwd() },
    ).trim();
    expect(out, `Полный объект User на публичной странице:\n${out}`).toBe('');
  });
});
