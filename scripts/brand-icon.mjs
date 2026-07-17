// Генерация иконки бренда «RP» (OAuth-приложение / favicon-задел). Ink-фон,
// антиква Georgia (фолбэк Cormorant), золотой штрих признания. SVG→PNG через sharp.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const S = 512;
const svg = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#191a1f"/>
      <stop offset="1" stop-color="#101116"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${S}" height="${S}" rx="104" fill="url(#bg)"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="central"
        font-family="Georgia, 'Times New Roman', serif" font-weight="600"
        font-size="256" letter-spacing="-6" fill="#f4f1ea">RP</text>
  <rect x="196" y="372" width="120" height="7" rx="3.5" fill="#c79a3b"/>
</svg>`;

const out = process.argv[2] || 'reportage-post-icon.png';
const buf = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(out, buf);
console.log('written', out, buf.length, 'bytes');
