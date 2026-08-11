import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Из любой внутренней страницы должен быть виден выход.
 *
 * Проверка появилась после разбора платформы владельцем: на части страниц
 * кабинета и админки вернуться было нечем, кроме кнопки браузера. Поодиночке
 * это мелочь, а вместе — ощущение недоделанности, которое замечают раньше
 * любой функции.
 */
function pagesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === 'page.tsx') out.push(full);
    }
  };
  walk(dir);
  return out;
}

describe('внутренние страницы не заканчиваются тупиком', () => {
  it('у каждой страницы кабинета и админки есть путь наверх', () => {
    const root = path.join(process.cwd(), 'src/app/ru');
    const pages = [...pagesUnder(path.join(root, 'cabinet')), ...pagesUnder(path.join(root, 'admin'))];

    // Корневые страницы разделов — сами точка возврата, им путь наверх не нужен
    const roots = new Set([
      path.join(root, 'cabinet/page.tsx'),
      path.join(root, 'admin/page.tsx'),
      path.join(root, 'cabinet/client/page.tsx'),
    ]);

    const orphans = pages
      .filter((p) => !roots.has(p))
      .filter((p) => {
        const src = readFileSync(p, 'utf8');
        return !src.includes('PageHeader') && !src.includes('crumbs');
      })
      .map((p) => p.replace(`${root}/`, ''));

    expect(orphans, `страницы без пути наверх:\n${orphans.join('\n')}`).toEqual([]);
  });
});
