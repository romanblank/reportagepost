import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Обратимость схемы при авто-откате (аудит 2026-08-16, P1).
 *
 * Деплой при провале health откатывается на ПРЕДЫДУЩИЙ образ, а миграции уже
 * применены. Это безопасно, только пока каждая миграция аддитивна
 * (expand-contract) — старый код обязан уметь читать новую схему. До этого
 * теста утверждение «миграции аддитивны» держалось на комментарии в
 * deploy.yml, то есть ни на чём: первый же DROP COLUMN превратил бы откат в
 * образ, падающий на каждом запросе, и выяснилось бы это в момент, когда прод
 * уже признан битым.
 *
 * Правило: деструктивный SQL допускается только с маркером
 * `-- contract: safe after <sha или дата>` — то есть осознанным contract-шагом
 * отдельным релизом, когда ни один живой образ старую колонку уже не читает.
 */
const DESTRUCTIVE = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bALTER\s+COLUMN\s+[^;]*\bTYPE\b/i, // смена типа ломает чтение старым кодом
  /\bALTER\s+COLUMN\s+[^;]*SET\s+NOT\s+NULL\b/i, // старый код пишет NULL и падает
  /\bRENAME\s+(COLUMN|TO)\b/i,
];
const MARKER = /--\s*contract:\s*safe after\s+\S+/i;

// Применённая история до появления стража. Проверена руками: единственная
// деструктивная миграция (timestamptz-переход 2026-08-03) прошла с даунтаймом
// осознанно. Новые имена сюда НЕ добавлять — для нового contract-шага есть
// маркер; пополнение списка означало бы «страж, который можно уговорить».
const GRANDFATHERED_BEFORE = '20260816000000';

describe('миграции: деструктивный SQL только с contract-маркером', () => {
  it('новые миграции аддитивны либо помечены осознанным contract-шагом', () => {
    const dir = path.join(process.cwd(), 'prisma/migrations');
    const offenders: string[] = [];

    for (const entry of readdirSync(dir)) {
      const file = path.join(dir, entry, 'migration.sql');
      try {
        if (!statSync(path.join(dir, entry)).isDirectory()) continue;
      } catch {
        continue;
      }
      // Историю до стража не судим — её уже применил прод
      if (entry.slice(0, 14) < GRANDFATHERED_BEFORE) continue;

      let sql: string;
      try {
        sql = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      // Комментарии не считаются SQL-ом
      const code = sql.replace(/--[^\n]*/g, '');
      const destructive = DESTRUCTIVE.some((re) => re.test(code));
      if (destructive && !MARKER.test(sql)) offenders.push(entry);
    }

    expect(
      offenders,
      `Деструктивные миграции без маркера contract (${offenders.join(', ')}): ` +
        'авто-откат деплоя вернёт образ, не умеющий читать эту схему. ' +
        'Либо перепишите аддитивно, либо пометьте «-- contract: safe after <версия>» ' +
        'и выпускайте ОТДЕЛЬНЫМ релизом после того, как expand-версия доехала.',
    ).toEqual([]);
  });
});
