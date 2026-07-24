// Креативные направления логотипа (не crop-marks). Прессовое/фотографическое
// наследие «репортажа». SVG→PNG через sharp.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const S = 512;
const INK = '#17181c';
const CREAM = '#f4f1ea';
const defs = `
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#191a1f"/><stop offset="1" stop-color="#101116"/></linearGradient>
  <radialGradient id="gold" cx="0.5" cy="0.4" r="0.65"><stop offset="0" stop-color="#f0c46e"/><stop offset="0.55" stop-color="#e8b04b"/><stop offset="1" stop-color="#b7791f"/></radialGradient>`;

// N2 — АПЕРТУРА (диафрагма): 6 лепестков ириса, золотой центр. Камера/оптика.
function aperture() {
  const cx = 256, cy = 256, R = 130, n = 6;
  let blades = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    // хорда лепестка: от вершины i к вершине i+1, смещённая внутрь (эффект ириса)
    const p0x = cx + R * Math.cos(a0), p0y = cy + R * Math.sin(a0);
    const p1x = cx + R * Math.cos(a1), p1y = cy + R * Math.sin(a1);
    // третья точка — смещена к центру по направлению a0 (лепесток)
    const inR = R * 0.34;
    const q0x = cx + inR * Math.cos(a0 - 0.25), q0y = cy + inR * Math.sin(a0 - 0.25);
    blades += `<path d="M${p0x.toFixed(1)} ${p0y.toFixed(1)} L${p1x.toFixed(1)} ${p1y.toFixed(1)} L${q0x.toFixed(1)} ${q0y.toFixed(1)} Z" fill="${CREAM}" opacity="${(0.6 + 0.06 * i).toFixed(2)}"/>`;
  }
  return `<rect width="${S}" height="${S}" rx="104" fill="url(#bg)"/>
    <circle cx="${cx}" cy="${cy}" r="${R + 10}" fill="none" stroke="${CREAM}" stroke-width="8" opacity="0.9"/>
    ${blades}
    <circle cx="${cx}" cy="${cy}" r="30" fill="url(#gold)"/>`;
}

// N3 — ХАЛФТОН-ФОКУС: концентрические прессовые точки, сходящиеся к золотому
// центру («напечатанный решающий момент»). Репортаж = печать/пресса.
function halftone() {
  let dots = '';
  const cx = 256, cy = 256;
  for (let ring = 1; ring <= 5; ring++) {
    const r = 26 + ring * 34;
    const count = ring * 6;
    const dotR = 15 - ring * 1.8;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * 2 * Math.PI + ring * 0.2;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotR.toFixed(1)}" fill="${CREAM}" opacity="${(0.9 - ring * 0.11).toFixed(2)}"/>`;
    }
  }
  return `<rect width="${S}" height="${S}" rx="104" fill="url(#bg)"/>${dots}<circle cx="${cx}" cy="${cy}" r="26" fill="url(#gold)"/>`;
}

// N4 — КАДР ПЛЁНКИ: одиночный кадр 35мм с перфорацией (аналоговое наследие).
function filmframe() {
  const x = 116, y = 150, w = 280, h = 212, hole = 22, gap = 14;
  let perf = '';
  for (let i = 0; i < 6; i++) {
    const hx = x + 16 + i * (hole + gap);
    perf += `<rect x="${hx}" y="${y + 8}" width="${hole}" height="16" rx="4" fill="${INK}"/>`;
    perf += `<rect x="${hx}" y="${y + h - 24}" width="${hole}" height="16" rx="4" fill="${INK}"/>`;
  }
  return `<rect width="${S}" height="${S}" rx="104" fill="url(#bg)"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${CREAM}"/>
    ${perf}
    <rect x="${x + 16}" y="${y + 34}" width="${w - 32}" height="${h - 68}" rx="6" fill="url(#bg)"/>
    <circle cx="256" cy="256" r="26" fill="url(#gold)"/>`;
}

const icons = { 'n2-aperture': aperture(), 'n3-halftone': halftone(), 'n4-film': filmframe() };
for (const [name, body] of Object.entries(icons)) {
  const svg = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}</svg>`;
  writeFileSync(`public/brand/logo-${name}.png`, await sharp(Buffer.from(svg)).png().toBuffer());
  console.log('written', name);
}

// N1 — МАСТХЕД (газетная шапка): «Reportage Post» как броадшит-нейм + кикер.
// Прессовое наследие «репортажа/поста». Светлый и тёмный.
function masthead(bg, ink, gold, rule) {
  const W = 1320, H = 420;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${bg}"/>
    <text x="${W / 2}" y="118" text-anchor="middle" font-family="Georgia, serif" font-size="26" letter-spacing="14" fill="${gold}">СОБЫТИЙНАЯ ФОТОГРАФИЯ</text>
    <line x1="120" y1="150" x2="${W - 120}" y2="150" stroke="${rule}" stroke-width="2"/>
    <text x="${W / 2}" y="278" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="128" letter-spacing="1" fill="${ink}">Reportage <tspan fill="${gold}">Post</tspan></text>
    <line x1="120" y1="322" x2="${W - 120}" y2="322" stroke="${rule}" stroke-width="2"/>
    <text x="${W / 2}" y="372" text-anchor="middle" font-family="Georgia, serif" font-size="24" letter-spacing="8" fill="${ink}" opacity="0.6">РЕПОРТАЖ КАК РЕМЕСЛО</text>
  </svg>`;
}
writeFileSync('public/brand/logo-n1-masthead.png', await sharp(Buffer.from(masthead('#faf8f3', INK, '#b7791f', '#c9c2b4'))).png().toBuffer());
console.log('written n1-masthead');
