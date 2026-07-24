// Варианты логотипа концепции A («Кадр» / crop-marks). Рендер SVG→PNG через sharp.
// Мотив: угловые метки кадрирования (видоискатель = репортаж) + золото признания.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const S = 512;
const INK = '#17181c';
const CREAM = '#f4f1ea';

const defs = `
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#191a1f"/><stop offset="1" stop-color="#101116"/>
  </linearGradient>
  <radialGradient id="gold" cx="0.5" cy="0.42" r="0.6">
    <stop offset="0" stop-color="#f0c46e"/><stop offset="0.55" stop-color="#e8b04b"/><stop offset="1" stop-color="#b7791f"/>
  </radialGradient>`;

// Угловые кронштейны рамки (inset — отступ от края квадрата, L — длина плеча)
function brackets(inset, L, w, color = CREAM) {
  const a = inset, b = S - inset, l = L;
  return `<g fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${a} ${a + l} L${a} ${a} L${a + l} ${a}"/>
    <path d="M${b} ${a + l} L${b} ${a} L${b - l} ${a}"/>
    <path d="M${a} ${b - l} L${a} ${b} L${a + l} ${b}"/>
    <path d="M${b} ${b - l} L${b} ${b} L${b - l} ${b}"/>
  </g>`;
}

const variants = {
  // A1 — рамка + золотая точка фокуса (исходная, доведённая)
  'a1-focus': `<rect width="${S}" height="${S}" rx="104" fill="url(#bg)"/>
    ${brackets(150, 62, 16)}
    <circle cx="256" cy="256" r="42" fill="none" stroke="#e8b04b" stroke-width="4" opacity="0.28"/>
    <circle cx="256" cy="256" r="27" fill="url(#gold)"/>`,

  // A2 — рамка кадрирует монограмму RP (антиква)
  'a2-rp': `<rect width="${S}" height="${S}" rx="104" fill="url(#bg)"/>
    ${brackets(120, 54, 14)}
    <text x="50%" y="53%" text-anchor="middle" dominant-baseline="central"
      font-family="Georgia, serif" font-weight="600" font-size="188" letter-spacing="-8" fill="${CREAM}">RP</text>
    <rect x="214" y="368" width="84" height="6" rx="3" fill="#c79a3b"/>`,

  // A3 — рамка кадрирует одну литеру R (чище на малом размере)
  'a3-r': `<rect width="${S}" height="${S}" rx="104" fill="url(#bg)"/>
    ${brackets(146, 60, 16)}
    <text x="50%" y="52%" text-anchor="middle" dominant-baseline="central"
      font-family="Georgia, serif" font-weight="600" font-size="210" fill="${CREAM}">R</text>`,

  // A4 — светлый вариант (кремовый фон, ink-рамка + золото)
  'a4-light': `<rect width="${S}" height="${S}" rx="104" fill="${CREAM}"/>
    ${brackets(150, 62, 15, INK)}
    <circle cx="256" cy="256" r="27" fill="url(#gold)"/>`,
};

// Горизонтальный wordmark-lockup (для шапки): знак-рамка + «Reportage Post».
// Единый <text> с <tspan> — текст течёт сам, без наездов.
const W = 1360, H = 320;
const wordmark = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${defs}</defs>
  <g transform="translate(40,40)">
    <rect width="240" height="240" rx="48" fill="url(#bg)"/>
    <g transform="scale(0.469)">${brackets(150, 62, 18)}
      <circle cx="256" cy="256" r="24" fill="url(#gold)"/></g>
  </g>
  <text x="320" y="200" font-family="Georgia, serif" font-weight="600" font-size="120" letter-spacing="-1" fill="${INK}">Reportage<tspan fill="#b7791f"> Post</tspan></text>
</svg>`;

for (const [name, body] of Object.entries(variants)) {
  const svg = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}</svg>`;
  const out = `public/brand/logo-${name}.png`;
  writeFileSync(out, await sharp(Buffer.from(svg)).png().toBuffer());
  console.log('written', out);
}
writeFileSync('public/brand/logo-wordmark.png', await sharp(Buffer.from(wordmark)).png().toBuffer());
console.log('written public/brand/logo-wordmark.png');
