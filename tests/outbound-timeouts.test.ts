import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Каждый исходящий fetch в src/lib обязан нести дедлайн (аудит 2026-08-16).
 *
 * fetch в Node без сигнала не имеет таймаута ВООБЩЕ. Vision стоит в пути
 * загрузки фото: его деградация до минуты на ответ означает 40-мегабайтные
 * буферы параллельных загрузок, живущие до OOM контейнера. Tinkoff Init —
 * в пути оплаты. «Внешний сервис медленный» не должно превращаться в «наш
 * сайт стоит».
 *
 * Проверка текстом, а не типами, потому что типы это не выражают: signal —
 * опциональное поле RequestInit.
 */
describe('исходящие вызовы: дедлайн обязателен', () => {
  it('в src/lib нет fetch без signal', () => {
    const dir = path.join(process.cwd(), 'src/lib');
    const offenders: string[] = [];

    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      // api.ts — клиентский слой со своим таймаутом внутри
      if (file === 'api.ts') continue;
      const src = readFileSync(path.join(dir, file), 'utf8');
      // Ищем вызовы fetch( и проверяем, что в пределах literal-опций есть
      // signal. Окно в 1500 символов покрывает длинные тела запросов с
      // комментариями; ложное срабатывание безопаснее пропуска
      const re = /await fetch\(|= fetch\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const window = src.slice(m.index, m.index + 1500);
        if (!window.includes('signal')) offenders.push(`${file}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(offenders, `fetch без дедлайна: ${offenders.join(', ')}`).toEqual([]);
  });
});
