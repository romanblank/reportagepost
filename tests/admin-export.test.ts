import { describe, expect, it } from 'vitest';
import { rowsToCsv, type ExportRow } from '@/lib/admin-export';

// Выгрузка B2B-данных: гарантия — в CSV нет персоналки (только рыночные поля),
// корректный CSV для RU-Excel. Чистый тест сборки (без БД).

const sample: ExportRow = {
  anon_id: 'abc123def456',
  created_month: '2026-07',
  city_slug: 'moscow',
  city: 'Москва',
  categories: 'Концерты / Деловые; события',
  does_video: true,
  experience_years: 11,
  cameras: 'Sony A1 | Sony A7 IV',
  lenses: '24-70/2.8 | 70-200/2.8',
  lighting: 'Godox AD200',
  equipment: 'Sony A1, 24-70',
  min_price_rub: 25000,
  photos_count: 42,
  verified: true,
};

describe('admin-export: CSV агрегируемых данных', () => {
  it('заголовок содержит только рыночные колонки — без персоналки', () => {
    const header = rowsToCsv([]).replace('﻿', '');
    const cols = header.split(';');
    expect(cols).toEqual([
      'anon_id', 'created_month', 'city_slug', 'city', 'categories',
      'does_video', 'experience_years', 'cameras', 'lenses', 'lighting',
      'equipment', 'min_price_rub', 'photos_count', 'verified',
    ]);
    // ни одного PII-поля
    for (const pii of ['first', 'last', 'name', 'email', 'phone', 'whatsapp', 'telegram', 'username', 'user_id', 'userId']) {
      expect(header.toLowerCase()).not.toContain(pii);
    }
  });

  it('строка рендерится с ; разделителем, экранирует ; в значении, BOM в начале', () => {
    const csv = rowsToCsv([sample]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines).toHaveLength(2);
    // значение с ; должно быть в кавычках (иначе разъедет по колонкам)
    expect(lines[1]).toContain('"Концерты / Деловые; события"');
    expect(lines[1]).toContain('abc123def456');
    expect(lines[1]).toContain('25000');
    expect(lines[1]).toContain('true');
  });

  it('пустой список — только заголовок', () => {
    const csv = rowsToCsv([]);
    expect(csv.replace('﻿', '').split('\r\n')).toHaveLength(1);
  });

  it('обезвреживает CSV formula-injection (=,+,-,@ в начале значения)', () => {
    for (const evil of ['=cmd|calc', '+1+1', '-2+3', '@SUM(A1)']) {
      const csv = rowsToCsv([{ ...sample, equipment: evil }]);
      const line = csv.replace('﻿', '').split('\r\n')[1];
      // значение предваряется апострофом → Excel не исполнит как формулу
      expect(line).toContain(`'${evil}`);
      expect(line).not.toContain(`;${evil}`); // без апострофа рядом с ; быть не должно
    }
  });
});
