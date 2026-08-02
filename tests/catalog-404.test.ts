import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Честный 404 на каталожных адресах (S4, долг из CLAUDE.md).
//
// Страницы города и жанра объявлены force-dynamic, поэтому Next начинает
// стримить ответ раньше, чем сработает notFound(): несуществующий город отдавал
// HTTP 200 с версткой «не найдено». Это soft-404 — поисковик считает страницу
// существующей и держит мусорный адрес в индексе. С снятием noindex (S4) это
// стало бы реальной проблемой выдачи.
//
// Проверка вынесена в proxy (до рендера) и опирается на статические списки.
// Здесь стережём то, что легко разъезжается: список собственных разделов
// платформы в proxy должен покрывать реальные каталоги src/app/ru — иначе
// новый раздел начнёт молча получать 404 вместо своей страницы.

describe('каталог: проверка адресов до рендера', () => {
  it('список разделов в proxy покрывает все каталоги src/app/ru', async () => {
    const dirs = readdirSync(path.join(process.cwd(), 'src/app/ru'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('[') && !d.name.startsWith('('))
      .map((d) => d.name);

    const src = readdirSync(path.join(process.cwd(), 'src'));
    expect(src, 'proxy.ts исчез — soft-404 вернётся').toContain('proxy.ts');

    const proxySrc = await import('node:fs').then((fs) =>
      fs.readFileSync(path.join(process.cwd(), 'src/proxy.ts'), 'utf8'),
    );
    const missing = dirs.filter((d) => !proxySrc.includes(`'${d}'`));
    expect(
      missing,
      `разделы не перечислены в proxy и будут отдавать 404: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('города и жанры берутся из тех же справочников, что и сид базы', async () => {
    // Если проверка начнёт опираться на свой список, он разойдётся с данными,
    // и живой город получит 404.
    const proxySrc = await import('node:fs').then((fs) =>
      fs.readFileSync(path.join(process.cwd(), 'src/proxy.ts'), 'utf8'),
    );
    expect(proxySrc).toContain("from '@/lib/geo-data'");
    expect(proxySrc).toContain("from '@/lib/category-data'");
  });
});
