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
      'does_video', 'experience_years', 'equipment', 'min_price_rub',
      'photos_count', 'verified',
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
});
