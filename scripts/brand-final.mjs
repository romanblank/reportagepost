// ФИНАЛЬНЫЙ бренд-пакет «Репортаж Пост».
// Знак: халфтон-фокус (чистая векторная геометрия — кружки + золотое ядро).
// Вордмарк: DIN Condensed, юстированный блок, ГЛИФЫ ПЕРЕВЕДЕНЫ В КРИВЫЕ
//   (opentype.js) → SVG не зависит от шрифта на устройстве.
// Выход: public/brand/final/*.svg + фавиконки/иконки (PNG) через sharp.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const opentype = require('/private/tmp/claude-501/-Users-Blank-Documents-----------myrep/8ce538e4-b3bd-426b-8b92-37b1dc07e9e5/scratchpad/logotool/node_modules/opentype.js');
const font = opentype.parse(readFileSync('/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf').buffer);
const EM = font.unitsPerEm; // 1000
const CAP = (font.tables.os2?.sCapHeight ?? font.ascender) / EM; // доля кегля до верха капители

const OUT = 'public/brand/final';
mkdirSync(OUT, { recursive: true });

// ── Палитра ──────────────────────────────────────────────────────────────────
const INK = '#17181c', CREAM = '#f4f1ea', GOLD = '#b7791f', GOLD2 = '#e8b04b';
const GOLDEN = 2.39996323;

const goldDef = (id = 'g') => `<radialGradient id="${id}" cx="0.42" cy="0.36" r="0.8"><stop offset="0" stop-color="#f6d488"/><stop offset="0.5" stop-color="#e8b04b"/><stop offset="1" stop-color="#b7791f"/></radialGradient>`;
const bgDef = `<radialGradient id="bg" cx="0.5" cy="0.42" r="0.85"><stop offset="0" stop-color="#1c1d23"/><stop offset="0.6" stop-color="#141519"/><stop offset="1" stop-color="#0d0e12"/></radialGradient>`;

function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = p(a), [br, bg, bb] = p(b);
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

// ── ЗНАК: разрежённый халфтон (count = ring*6 ≈ 90 точек) ─────────────────────
function halftoneDots({ cx = 256, cy = 256, dotFill, warmFill, rings = 5, r0 = 30, dr = 33, dotBase = 13 }) {
  let d = '';
  for (let ring = 1; ring <= rings; ring++) {
    const r = r0 + ring * dr, count = ring * 6;
    const dotR = dotBase - (ring - 1) * (dotBase - 6.2) / (rings - 1);
    const op = 0.95 - (ring - 1) * 0.11;
    const warm = Math.max(0, 1 - r / 100);
    const fill = warm > 0 && warmFill ? mix(dotFill, warmFill, warm * 0.8) : dotFill;
    const off = ring * GOLDEN;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 2 * Math.PI + off;
      d += `<circle cx="${(cx + r * Math.cos(a)).toFixed(2)}" cy="${(cy + r * Math.sin(a)).toFixed(2)}" r="${dotR.toFixed(2)}" fill="${fill}" opacity="${op.toFixed(3)}"/>`;
    }
  }
  return d;
}
function coreDots({ cx = 256, cy = 256, R = 17, gid = 'g' }) {
  return `<circle cx="${cx}" cy="${cy}" r="${R * 2.7}" fill="url(#${gid})" opacity="0.09"/><circle cx="${cx}" cy="${cy}" r="${R * 1.7}" fill="url(#${gid})" opacity="0.16"/><circle cx="${cx}" cy="${cy}" r="${R * 1.25}" fill="url(#${gid})" opacity="0.28"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${gid})"/><circle cx="${(cx - R * 0.28).toFixed(1)}" cy="${(cy - R * 0.3).toFixed(1)}" r="${(R * 0.3).toFixed(1)}" fill="#fdeec6" opacity="0.85"/>`;
}

// Знак на тёмной плитке (иконка приложения / фавикон)
function markTile() {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${bgDef}${goldDef('g')}</defs><rect width="512" height="512" rx="114" fill="url(#bg)"/>${halftoneDots({ dotFill: CREAM, warmFill: '#f0c46e' })}${coreDots({})}</svg>`;
}
// Знак maskable (доп. поля 12% под safe-zone Android)
function markMaskable() {
  const s = 0.78, off = 256 * (1 - s);
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${bgDef}${goldDef('g')}</defs><rect width="512" height="512" fill="#0d0e12"/><g transform="translate(${off},${off}) scale(${s})">${halftoneDots({ dotFill: CREAM, warmFill: '#f0c46e' })}${coreDots({})}</g></svg>`;
}
// Прозрачный глиф (кремовые точки) — для тёмных подложек / инлайна
function markGlyphCream() {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${goldDef('g')}</defs>${halftoneDots({ dotFill: CREAM, warmFill: '#f0c46e' })}${coreDots({})}</svg>`;
}
// Инлайн-глиф под currentColor (точки = currentColor, ядро золотое) — для шапки на любом фоне
function markGlyphCurrent() {
  return `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${goldDef('g')}</defs>${halftoneDots({ dotFill: 'currentColor' })}${coreDots({})}</svg>`;
}

// ── ВОРДМАРК (DIN, кривые) ────────────────────────────────────────────────────
// Раскладка строки. targetW задаёт ширину (юстировка); иначе — натуральная
// с равномерным трекингом track (доля кегля). Возвращает {d, width}.
function layoutLine(text, size, targetW, x0, baseY, track = 0) {
  const scale = size / EM;
  const adv = [...text].map((ch) => font.charToGlyph(ch).advanceWidth * scale);
  const natural = adv.reduce((a, b) => a + b, 0);
  const gaps = text.length > 1 ? text.length - 1 : 1;
  const ls = targetW != null ? (targetW - natural) / gaps : track * size;
  let x = x0, d = '';
  [...text].forEach((ch, i) => {
    // Округляем перо: opentype.js даёт NaN-координаты на дробном пере при
    // повторных вызовах getPath (баг стейта) → librsvg обрывает путь. Целое x лечит.
    d += font.getPath(ch, Math.round(x), baseY, size).toPathData(2);
    x += adv[i] + ls;
  });
  return { d, width: natural + ls * gaps };
}

// Двухстрочный логотип: РЕПОРТАЖ (ширина-эталон) + ПОСТ (ровный трекинг, ~ratio
// от ширины верхней строки — без «разъехавшихся» букв). Возвращает пути и метрики.
function buildLines(size, x0, y1, gap, ratio = 0.68) {
  const top = layoutLine('РЕПОРТАЖ', size, null, x0, y1, 0.015);
  const bottom = layoutLine('ПОСТ', size, top.width * ratio, x0, y1 + gap);
  return { top, bottom, blockW: top.width };
}

// Standalone SVG блока: РЕПОРТАЖ (натуральный) + ПОСТ (ровный трекинг ~ratio ширины)
function wordmarkSVG({ ink = 'currentColor', accent = GOLD }) {
  const size = 172, gap = 150, pad = 8, y1 = pad + CAP * size;
  const { top, bottom, blockW } = buildLines(size, pad, y1, gap);
  const W = (blockW + pad * 2).toFixed(0), H = (y1 + gap + size * 0.04).toFixed(0);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><path d="${top.d}" fill="${ink}"/><path d="${bottom.d}" fill="${accent}"/></svg>`;
}

// Мини-знак для лока́па: радиус вписан, центрирован по (cx,cy). Точки currentColor
// (шапка) или ink с тёплым ядром (цветные лока́пы).
function markDots({ cx, cy, maxR = 100, dotFill, warmAccent, currentColor = false }) {
  let d = '';
  const dr = maxR / 4;
  for (let ring = 1; ring <= 4; ring++) {
    const r = ring * dr, count = ring * 6, dotR = (11 - (ring - 1) * 1.8) * (maxR / 100);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 2 * Math.PI + ring * GOLDEN;
      let fill = currentColor ? 'currentColor' : dotFill;
      if (!currentColor && warmAccent && ring === 1) fill = mix(dotFill, warmAccent, 0.55);
      d += `<circle cx="${(cx + r * Math.cos(a)).toFixed(1)}" cy="${(cy + r * Math.sin(a)).toFixed(1)}" r="${dotR.toFixed(1)}" fill="${fill}" opacity="${(0.92 - ring * 0.13).toFixed(2)}"/>`;
    }
  }
  d += `<circle cx="${cx}" cy="${cy}" r="${(12 * maxR / 100).toFixed(1)}" fill="url(#g)"/>`;
  return d;
}

// Оптический центр двухстрочного блока (верх капители строки1 ↔ базовая строки2)
function blockCenter(y1, gap, size) { return (y1 - CAP * size + (y1 + gap)) / 2; }

// Горизонтальный лока́п для ШАПКИ: мини-знак + блок (компакт). currentColor + accent.
function headerLockup() {
  const size = 150, bx = 280, maxR = 100;
  const y1 = 128, gap = 128;
  const cx = maxR + 20, cy = blockCenter(y1, gap, size);
  const dots = markDots({ cx, cy, maxR, currentColor: true });
  const { top, bottom, blockW } = buildLines(size, bx, y1, gap);
  const W = bx + blockW + 10, H = 290;
  return `<svg viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg" style="height:100%;width:auto;display:block"><defs>${goldDef('g')}</defs>${dots}<path d="${top.d}" fill="currentColor"/><path d="${bottom.d}" fill="var(--recognition, ${GOLD})"/></svg>`;
}

// Полный лока́п на тёмном/светлом (готовые изображения — соцсети, письма, док)
function fullLockup({ bg, ink, accent }) {
  const size = 150, bx = 280, maxR = 100;
  const y1 = 150, gap = 130;
  const cx = maxR + 20, cy = blockCenter(y1, gap, size);
  const dots = markDots({ cx, cy, maxR, dotFill: ink, warmAccent: accent });
  const { top, bottom, blockW } = buildLines(size, bx, y1, gap);
  const kick = layoutLine('СОБЫТИЙНАЯ ФОТОГРАФИЯ · КАТАЛОГ', 26, blockW, bx, y1 + gap + 44);
  const W = bx + blockW + 40, H = 350;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs>${goldDef('g')}</defs><rect width="${W}" height="${H}" fill="${bg}"/>${dots}<path d="${top.d}" fill="${ink}"/><path d="${bottom.d}" fill="${accent}"/><path d="${kick.d}" fill="${mix(ink, bg, 0.45)}"/></svg>`;
}

// ── Записать SVG ──────────────────────────────────────────────────────────────
const svgs = {
  'mark-tile.svg': markTile(),
  'mark-maskable.svg': markMaskable(),
  'mark-glyph-cream.svg': markGlyphCream(),
  'mark-glyph-current.svg': markGlyphCurrent(),
  'wordmark.svg': wordmarkSVG({ ink: '#17181c', accent: GOLD }),
  'wordmark-current.svg': wordmarkSVG({ ink: 'currentColor', accent: GOLD }),
  'wordmark-mono.svg': wordmarkSVG({ ink: 'currentColor', accent: 'currentColor' }),
  'header-lockup.svg': headerLockup(),
  'lockup-dark.svg': fullLockup({ bg: '#131418', ink: CREAM, accent: GOLD2 }),
  'lockup-light.svg': fullLockup({ bg: '#f4f2ee', ink: INK, accent: GOLD }),
};
for (const [name, s] of Object.entries(svgs)) writeFileSync(`${OUT}/${name}`, s);

// ── Фавиконки / иконки (PNG из тёмной плитки и maskable) ──────────────────────
const tileBuf = Buffer.from(markTile());
const maskBuf = Buffer.from(markMaskable());
async function png(svgBuf, size, file) {
  writeFileSync(file, await sharp(svgBuf, { density: 384 }).resize(size, size).png().toBuffer());
}
async function pngW(svgBuf, width, file) { // сохранить пропорции (широкие лока́пы)
  writeFileSync(file, await sharp(svgBuf, { density: 384 }).resize({ width }).png().toBuffer());
}

// Упрощённый знак для МЕЛКИХ фавиконок (16/32): меньше колец, крупнее точки,
// чтобы не превращалось в кашу.
function markTileSmall() {
  let dots = '';
  for (let ring = 1; ring <= 3; ring++) {
    const r = 44 + ring * 52, count = ring === 1 ? 6 : ring * 6, dotR = 30 - (ring - 1) * 7;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 2 * Math.PI + ring * GOLDEN;
      dots += `<circle cx="${(256 + r * Math.cos(a)).toFixed(1)}" cy="${(256 + r * Math.sin(a)).toFixed(1)}" r="${dotR}" fill="${CREAM}" opacity="${(0.95 - ring * 0.13).toFixed(2)}"/>`;
    }
  }
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${bgDef}${goldDef('g')}</defs><rect width="512" height="512" rx="96" fill="url(#bg)"/>${dots}<circle cx="256" cy="256" r="40" fill="url(#g)"/></svg>`;
}
const smallBuf = Buffer.from(markTileSmall());
writeFileSync(`${OUT}/mark-tile-small.svg`, markTileSmall());
await png(smallBuf, 16, `${OUT}/favicon-16.png`);
await png(smallBuf, 32, `${OUT}/favicon-32.png`);
await png(tileBuf, 48, `${OUT}/favicon-48.png`);
await png(tileBuf, 180, `${OUT}/apple-touch-icon.png`);
await png(tileBuf, 192, `${OUT}/icon-192.png`);
await png(tileBuf, 512, `${OUT}/icon-512.png`);
await png(maskBuf, 512, `${OUT}/icon-maskable-512.png`);
// превью-раскладки (для галереи/брендбука) — сохраняя пропорции
await pngW(Buffer.from(svgs['lockup-dark.svg']), 1200, `${OUT}/_preview-lockup-dark.png`);
await pngW(Buffer.from(svgs['lockup-light.svg']), 1200, `${OUT}/_preview-lockup-light.png`);
await pngW(Buffer.from(svgs['wordmark.svg']), 900, `${OUT}/_preview-wordmark.png`);
await pngW(Buffer.from(svgs['header-lockup.svg'].replace('currentColor', CREAM)), 900, `${OUT}/_preview-header.png`);

// ── React-компонент шапки (SVG заинлайнен; ink=currentColor, gold=--recognition) ──
const headerSvg = svgs['header-lockup.svg'].replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const component = `// АВТОГЕНЕРАТ — scripts/brand-final.mjs. Не редактировать вручную.
// Знак «Репортаж Пост»: халфтон-фокус + вордмарк DIN Condensed (глифы в кривых).
// ink = currentColor (наследует цвет текста), «ПОСТ» = var(--recognition) (тема).
const SVG = \`${headerSvg}\`;

export function BrandLockup({ className }: { className?: string }) {
  return (
    <span
      className={className}
      role="img"
      aria-label="Репортаж Пост"
      dangerouslySetInnerHTML={{ __html: SVG }}
    />
  );
}
`;
writeFileSync('src/components/BrandLockup.tsx', component);

console.log('written', Object.keys(svgs).length, 'svg + favicons + BrandLockup.tsx →', OUT);
