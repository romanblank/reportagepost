import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';

// Экспорт агрегируемых знаний платформы для анализа (B2B-актив: рынок техники,
// жанров, гео, цен). ПЕРСОНАЛКА НЕ ВЫГРУЖАЕТСЯ: ни имён, ни контактов, ни
// username — только устойчивый анонимный id (sha256) + рыночные поля. Паттерн
// «санитизация до выгрузки» (перенято из Verifi _sanitize_for_prompt).

const DELIM = ';'; // RU-Excel дружелюбный разделитель

const COLUMNS = [
  'anon_id', 'created_month', 'city_slug', 'city', 'categories',
  'does_video', 'experience_years', 'cameras', 'lenses', 'lighting',
  'equipment', 'min_price_rub', 'photos_count', 'verified',
] as const;

/** Анонимный устойчивый идентификатор — не раскрывает профиль/username. */
function anonId(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 12);
}

function cell(v: string | number | boolean | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /["\n\r;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface ExportRow {
  anon_id: string;
  created_month: string; // YYYY-MM (без точной даты — меньше деанонимизации)
  city_slug: string;
  city: string;
  categories: string;
  does_video: boolean;
  experience_years: number | null;
  cameras: string;
  lenses: string;
  lighting: string;
  equipment: string;
  min_price_rub: number | null;
  photos_count: number;
  verified: boolean;
}

export async function photographerExportRows(): Promise<ExportRow[]> {
  const profiles = await db.photographerProfile.findMany({
    where: { status: 'APPROVED' },
    include: {
      city: true,
      categories: { include: { category: true } },
      packages: { orderBy: { priceMinor: 'asc' }, take: 1 },
      photos: { where: { status: 'APPROVED' }, select: { id: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return profiles.map((p) => ({
    anon_id: anonId(p.id),
    created_month: p.createdAt.toISOString().slice(0, 7),
    city_slug: p.city.slug,
    city: cityNameRu(p.city.slug),
    categories: p.categories.map((c) => categoryNameRu(c.category.slug)).join(' / '),
    does_video: p.doesVideo,
    experience_years: p.experienceYears ?? null,
    cameras: p.cameras.join(' | '),
    lenses: p.lenses.join(' | '),
    lighting: p.lighting.join(' | '),
    equipment: p.equipment ?? '',
    min_price_rub: p.packages[0] ? Math.round(p.packages[0].priceMinor / 100) : null,
    photos_count: p.photos.length,
    verified: p.verified,
  }));
}

/** Чистая сборка CSV из строк (тестируемо без БД). Колонки фиксированы COLUMNS —
 * персоналка не может «протечь»: выгружаются только перечисленные поля. */
export function rowsToCsv(rows: ExportRow[]): string {
  const header = COLUMNS.join(DELIM);
  const body = rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(DELIM)).join('\r\n');
  // BOM — чтобы Excel корректно открыл кириллицу в UTF-8.
  return body ? `﻿${header}\r\n${body}` : `﻿${header}`;
}

/** Готовый CSV (заголовок + строки), UTF-8. Персоналки в нём нет. */
export async function photographerExportCsv(): Promise<string> {
  return rowsToCsv(await photographerExportRows());
}
