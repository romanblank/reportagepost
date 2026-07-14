// Генерация PWA-иконок из SVG (фирменная акцентная точка на тёмной плитке).
// Запуск: node scripts/gen-icons.mjs — пишет PNG в public/icons (коммитятся как статика).
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');

const INK = '#17161b';
const ACCENT = '#df4635';

// r — доля радиуса точки от размера. Для maskable точка меньше (safe zone).
function svg(size, dotRatio, rounded) {
  const cx = size / 2;
  const r = size * dotRatio;
  const rx = rounded ? size * 0.22 : 0;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${rx}" fill="${INK}"/>
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="${ACCENT}"/>
    </svg>`,
  );
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const jobs = [
    { name: 'icon-192.png', size: 192, dot: 0.26, rounded: true },
    { name: 'icon-512.png', size: 512, dot: 0.26, rounded: true },
    // maskable: полный фон, точка в безопасной зоне (без скругления — маску наложит ОС)
    { name: 'icon-maskable-512.png', size: 512, dot: 0.22, rounded: false },
    { name: 'apple-touch-icon.png', size: 180, dot: 0.26, rounded: false },
  ];
  for (const j of jobs) {
    await sharp(svg(j.size, j.dot, j.rounded)).png().toFile(join(outDir, j.name));
    console.log('written', j.name);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
