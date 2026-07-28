// Регенерация ДЕМО-плейсхолдеров футажа: тот же радиальный градиент по категории,
// но подпись «СТОК · Категория» — МЕЛКО и аккуратно внизу кадра (а не на пол-экрана).
// Только локальные .uploads (демо). Запуск: node scripts/gen-futazh-placeholders.mjs [dir]
import sharp from 'sharp';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.uploads/photos');

// категория → русское имя + цвета свечения (центр→середина), края уходят в почти-чёрный
const CATS = {
  'business-events': { ru: 'Деловые события', glow: '#3b6ea5', mid: '#1c3350' },
  'concerts-festivals': { ru: 'Концерты', glow: '#b23246', mid: '#4d1620' },
  corporate: { ru: 'Корпоративы', glow: '#bd7d24', mid: '#5a3a10' },
  'private-events': { ru: 'Частные события', glow: '#7d5cc0', mid: '#382a5e' },
  sports: { ru: 'Спорт', glow: '#2f9160', mid: '#123a28' },
  'street-city': { ru: 'Город', glow: '#c05f22', mid: '#4d2610' },
};

function catOf(dir) {
  const base = dir.replace(/^futazh-/, '').replace(/-\d+-\d+$/, '');
  return CATS[base] ?? { ru: 'Репортаж', glow: '#6b6b6b', mid: '#2a2a2a' };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svg(w, h, cat) {
  // подпись масштабируется от ширины; небольшая, внизу слева
  const fs = Math.max(11, Math.round(w * 0.026));
  const pad = Math.round(w * 0.045);
  const label = `СТОК · ${cat.ru.toUpperCase()}`;
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="50%" cy="42%" r="78%">
      <stop offset="0%" stop-color="${cat.glow}"/>
      <stop offset="52%" stop-color="${cat.mid}"/>
      <stop offset="100%" stop-color="#0d0b0a"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="${pad}" y="${h - pad}" font-family="Helvetica, Arial, 'DejaVu Sans', sans-serif"
        font-size="${fs}" font-weight="600" letter-spacing="${Math.round(fs * 0.12)}"
        fill="#ffffff" fill-opacity="0.66">${esc(label)}</text>
</svg>`,
  );
}

async function regen(file, cat) {
  if (!existsSync(file)) return;
  const { width, height } = await sharp(file).metadata();
  if (!width || !height) return;
  const buf = await sharp(svg(width, height, cat)).jpeg({ quality: 82 }).toBuffer();
  await sharp(buf).toFile(file);
}

const only = process.argv[2];
const dirs = readdirSync(ROOT).filter((d) => d.startsWith('futazh-') && (!only || d === only));
let n = 0;
for (const d of dirs) {
  const cat = catOf(d);
  for (const v of ['web.jpg', 'thumb.jpg', 'original.jpg']) {
    await regen(path.join(ROOT, d, v), cat);
  }
  n++;
}
console.log(`регенерировано футаж-папок: ${n}`);
