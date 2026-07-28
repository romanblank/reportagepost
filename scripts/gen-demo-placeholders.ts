// Единый чистый стиль ДЕМО-плейсхолдеров для ВСЕХ фото (не только футаж): радиальный
// градиент по категории + мелкая подпись «СТОК · Категория» внизу. Категория берётся
// из БД (UUID-папки её не кодируют). Только локальные .uploads. Реального контента нет
// (S3=амбассадор), поэтому перегенерация безопасна. Запуск: npx tsx scripts/gen-demo-placeholders.ts
import 'dotenv/config';
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { db } from '@/lib/db';

const UPLOADS = path.resolve('.uploads');

const CATS: Record<string, { ru: string; glow: string; mid: string }> = {
  'business-events': { ru: 'Деловые события', glow: '#3b6ea5', mid: '#1c3350' },
  'concerts-festivals': { ru: 'Концерты', glow: '#b23246', mid: '#4d1620' },
  corporate: { ru: 'Корпоративы', glow: '#bd7d24', mid: '#5a3a10' },
  'private-events': { ru: 'Частные события', glow: '#7d5cc0', mid: '#382a5e' },
  sports: { ru: 'Спорт', glow: '#2f9160', mid: '#123a28' },
  'street-city': { ru: 'Город', glow: '#c05f22', mid: '#4d2610' },
};
const FALLBACK = { ru: 'Репортаж', glow: '#5b6470', mid: '#262c34' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svg(w: number, h: number, cat: { ru: string; glow: string; mid: string }): Buffer {
  const fs = Math.max(11, Math.round(w * 0.026));
  const pad = Math.round(w * 0.045);
  const label = `СТОК · ${cat.ru.toUpperCase()}`;
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs><radialGradient id="g" cx="50%" cy="42%" r="78%">
    <stop offset="0%" stop-color="${cat.glow}"/>
    <stop offset="52%" stop-color="${cat.mid}"/>
    <stop offset="100%" stop-color="#0d0b0a"/>
  </radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="${pad}" y="${h - pad}" font-family="Helvetica, Arial, 'DejaVu Sans', sans-serif"
        font-size="${fs}" font-weight="600" letter-spacing="${Math.round(fs * 0.12)}"
        fill="#ffffff" fill-opacity="0.66">${esc(label)}</text>
</svg>`,
  );
}

async function regen(file: string, cat: { ru: string; glow: string; mid: string }) {
  if (!existsSync(file)) return;
  const meta = await sharp(file).metadata();
  if (!meta.width || !meta.height) return;
  const buf = await sharp(svg(meta.width, meta.height, cat)).jpeg({ quality: 82 }).toBuffer();
  await sharp(buf).toFile(file);
}

async function main() {
  const photos = await db.photo.findMany({ select: { storageKey: true, category: { select: { slug: true } } } });
  let n = 0;
  for (const p of photos) {
    const cat = CATS[p.category?.slug ?? ''] ?? FALLBACK;
    const dir = path.dirname(p.storageKey); // photos/<dir>
    for (const v of ['web.jpg', 'thumb.jpg', 'original.jpg']) {
      await regen(path.join(UPLOADS, dir, v), cat);
    }
    n++;
  }
  console.log(`перегенерировано фото: ${n}`);
  process.exit(0);
}
main();
