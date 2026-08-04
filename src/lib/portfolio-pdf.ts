import path from 'node:path';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import { PDF_PHOTO_LIMIT, type PlanTier } from '@/lib/pricing';
import { plural } from '@/i18n/ru';

/**
 * Презентация портфолио одним файлом.
 *
 * Зачем она вообще: заказчик от компании почти никогда не выбирает подрядчика
 * в одиночку. Ссылку на сайт он показать не может — на встрече открывают
 * почту, а не браузер, и решение принимают трое людей, из которых двое не
 * фотографы. Поэтому автор и так собирает такой файл руками в Canva, теряя на
 * этом вечер и весь свой визуальный язык.
 *
 * Файл делаем не «выгрузкой снимков», а тем же продуктом, что и сайт: тёмный
 * кинематографичный грунт, тёплая слоновая кость, коралловый акцент — токены
 * из globals.css, один в один. Кадры лежат на тёмном и не искажаются.
 *
 * Кадры автора мы не портим водяным знаком. Присутствие платформы — сдержанная
 * подпись на полях; бесплатному уровню она достаётся на каждой странице, а
 * подписчику — только в выходных данных. Разница ощущается на встрече, но не
 * ценой чужой работы: перечёркнутый кадр обесценил бы автора, а не нас.
 */

export type PdfPhoto = {
  /** Готовый JPEG кадра (web-вариант) — читает вызывающий код. */
  buffer: Buffer;
  categoryName: string | null;
};

export type PdfAuthor = {
  firstName: string;
  lastName: string;
  cityName: string;
  categories: string[];
  phone: string | null;
  email: string | null;
  siteUrl: string | null;
  profileUrl: string;
  /** Кадр обложки — отдельно от подборки: он несёт всю первую страницу. */
  cover: Buffer | null;
  shoots: { count: number; clients: number; returning: number } | null;
  reviews: { author: string; body: string; verified: boolean }[];
};

const INK = '#ece7dd';
const INK_2 = '#c3bfb5';
const MUTED = '#9295a2';
const PAPER = '#0f1218';
const ACCENT = '#e08a5e';
const LINE = '#272b34';

// A4 альбомная: презентацию смотрят с экрана, и вертикальный лист заставлял бы
// кадры съёживаться до марок ради полей, которых на экране никто не ценит
const W = 842;
const H = 595;
const M = 46;

const FONT_DIR = path.join(process.cwd(), 'src/assets/fonts');
const DISPLAY = path.join(FONT_DIR, 'CormorantGaramond-SemiBold.ttf');
const BODY = path.join(FONT_DIR, 'Inter-Regular.ttf');
const BODY_BOLD = path.join(FONT_DIR, 'Inter-SemiBold.ttf');

/** Разрядка для мелких прописных надписей — вручную: pdfkit не умеет tracking. */
function tracked(text: string, spacing: number): string {
  return text.split('').join(' '.repeat(Math.max(1, Math.round(spacing))));
}

type Doc = PDFKit.PDFDocument;

function page(doc: Doc, first = false) {
  if (!first) doc.addPage({ size: [W, H], margin: 0 });
  doc.rect(0, 0, W, H).fill(PAPER);
}

/**
 * Вписать кадр в прямоугольник БЕЗ полей и без искажения: обрезаем по центру.
 * Верстка презентации держится на строгой сетке, и кадр, оставивший рядом с
 * собой воздух неравной ширины, ломает её сильнее, чем срезанный край.
 */
async function coverFit(buffer: Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({
      width: Math.round(w * 2),
      height: Math.round(h * 2),
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

async function drawPhoto(doc: Doc, buffer: Buffer, x: number, y: number, w: number, h: number) {
  const fitted = await coverFit(buffer, w, h);
  doc.image(fitted, x, y, { width: w, height: h });
}

/**
 * Раскладки разворотов.
 *
 * Одинаковая сетка на сорока страницах усыпляет, а случайная — выглядит
 * небрежно. Поэтому чередуем три раскладки по постоянному циклу: один кадр во
 * всю страницу, затем два, затем три с доминантой. Ритм читается как замысел.
 */
const LAYOUTS: { slots: [number, number, number, number][] }[] = [
  { slots: [[0, 0, W, H]] },
  {
    slots: [
      [0, 0, W / 2 - 1, H],
      [W / 2 + 1, 0, W / 2 - 1, H],
    ],
  },
  {
    slots: [
      [0, 0, W * 0.62 - 1, H],
      [W * 0.62 + 1, 0, W * 0.38 - 1, H / 2 - 1],
      [W * 0.62 + 1, H / 2 + 1, W * 0.38 - 1, H / 2 - 1],
    ],
  },
];

async function coverPage(doc: Doc, a: PdfAuthor) {
  page(doc, true);

  // Имя лежит не поверх кадра, а на собственной полосе под ним.
  //
  // Затемнение снизу — обычный приём, но оно ставит читаемость обложки в
  // зависимость от того, что автор снял: две попытки утонули в светлом дереве
  // и полуденном небе. Полоса грунта под кадром делает первую страницу
  // предсказуемой на любом портфолио и заодно превращает кадр в окно —
  // разворот читается как журнальный, а не как открытка с подписью.
  const plate = 128;
  const imgH = H - plate;
  if (a.cover) await drawPhoto(doc, a.cover, 0, 0, W, imgH);

  doc.rect(0, imgH, W, plate).fill(PAPER);
  doc.moveTo(M, imgH).lineTo(W - M, imgH).lineWidth(0.6).stroke(ACCENT);

  doc.font(BODY).fontSize(7).fillColor(ACCENT)
    .text(tracked('Репортажная съёмка', 1.6).toUpperCase(), M, imgH + 22, { width: W - M * 2 });
  doc.font(DISPLAY).fontSize(52).fillColor(INK)
    .text(`${a.firstName} ${a.lastName}`, M, imgH + 40, { width: W * 0.66, lineGap: -8 });

  const subtitle = [a.cityName, ...a.categories.slice(0, 3)].filter(Boolean).join('  ·  ');
  doc.font(BODY).fontSize(8).fillColor(MUTED)
    .text(tracked(subtitle.toUpperCase(), 1), W * 0.66, imgH + 58, {
      width: W * 0.34 - M,
      align: 'right',
    });
}

async function photoPages(doc: Doc, photos: PdfPhoto[], brandEveryPage: boolean) {
  let i = 0;
  let layout = 0;
  while (i < photos.length) {
    const slots = LAYOUTS[layout % LAYOUTS.length].slots;
    const take = photos.slice(i, i + slots.length);
    // Раскладку на три кадра не выводим ради одного: пустые слоты выглядели бы
    // как потерянные файлы
    if (take.length < slots.length && slots.length > 1) {
      layout += 1;
      continue;
    }
    page(doc);
    for (let s = 0; s < take.length; s += 1) {
      const [x, y, w, h] = slots[s];
      await drawPhoto(doc, take[s].buffer, x, y, w, h);
    }
    if (brandEveryPage) {
      doc.rect(0, H - 26, W, 26).fillOpacity(0.55).fill('#000000');
      doc.fillOpacity(1);
      doc.font(BODY).fontSize(6.5).fillColor(INK_2)
        .text(tracked('Репортаж Пост'.toUpperCase(), 1.4), M, H - 17, { width: W - M * 2, align: 'right' });
    }
    i += take.length;
    layout += 1;
  }
}

async function factsAndContacts(doc: Doc, a: PdfAuthor, tier: PlanTier, strip: PdfPhoto[]) {
  page(doc);

  doc.font(DISPLAY).fontSize(34).fillColor(INK).text('Связаться', M, M + 6);
  doc.moveTo(M, M + 58).lineTo(W - M, M + 58).lineWidth(0.6).stroke(LINE);

  const left = M;
  const right = W / 2 + 12;
  let y = M + 84;

  const line = (label: string, value: string) => {
    doc.font(BODY).fontSize(7).fillColor(MUTED).text(tracked(label.toUpperCase(), 1.2), left, y);
    doc.font(BODY_BOLD).fontSize(12).fillColor(INK).text(value, left, y + 13, { width: W / 2 - M - 20 });
    y += 46;
  };

  if (a.phone) line('Телефон', a.phone);
  if (a.email) line('Почта', a.email);
  if (a.siteUrl) line('Сайт', a.siteUrl);
  line('Страница автора', a.profileUrl);

  // Факты — только подтверждённые обеими сторонами съёмки. Средний балл и ранг
  // не выводим здесь ровно потому же, почему не выводим на сайте: цифра «4,7»
  // сравнивает людей, а «снимали вместе 12 раз» описывает работу
  let fy = M + 84;
  if (a.shoots && a.shoots.count > 0) {
    doc.font(BODY).fontSize(7).fillColor(MUTED)
      .text(tracked('Подтверждено заказчиками', 1.2), right, fy);
    fy += 16;
    doc.font(BODY_BOLD).fontSize(38).fillColor(ACCENT).text(String(a.shoots.count), right, fy);
    doc.font(BODY).fontSize(10).fillColor(INK_2)
      .text(
        `${plural(a.shoots.count, ['съёмка отмечена', 'съёмки отмечены', 'съёмок отмечены'])} самими заказчиками`,
        right,
        fy + 48,
        { width: W / 2 - M - 20 },
      );
    fy += 82;
    if (a.shoots.returning > 0) {
      doc.font(BODY_BOLD).fontSize(11).fillColor(INK)
        .text(
          `${a.shoots.returning} ${plural(a.shoots.returning, ['заказчик вернулся', 'заказчика вернулись', 'заказчиков вернулись'])} снова`,
          right,
          fy,
          { width: W / 2 - M - 20 },
        );
      fy += 26;
    }
  }

  for (const r of a.reviews.slice(0, 2)) {
    doc.font(DISPLAY).fontSize(13).fillColor(INK_2)
      .text(`«${r.body.slice(0, 180)}»`, right, fy, { width: W / 2 - M - 20, lineGap: 2 });
    fy = doc.y + 6;
    doc.font(BODY).fontSize(8).fillColor(MUTED)
      .text(r.verified ? `${r.author} · съёмка подтверждена` : r.author, right, fy);
    fy = doc.y + 18;
  }

  // Лента кадров по нижнему краю: без неё половина листа пустует, и последнее,
  // что остаётся у заказчика после встречи, — таблица контактов, а не работы
  const stripH = 158;
  const stripY = H - stripH;
  if (strip.length >= 3) {
    const gap = 2;
    const w = (W - gap * 2) / 3;
    for (let i = 0; i < 3; i += 1) {
      await drawPhoto(doc, strip[i].buffer, i * (w + gap), stripY, w, stripH);
    }
  }

  doc.font(BODY).fontSize(7).fillColor(MUTED)
    .text(
      tier === 'FREE'
        ? 'Портфолио целиком и свежие работы — на странице автора в Репортаж Пост'
        : 'Портфолио целиком и свежие работы — на странице автора',
      M,
      stripY - 26,
      { width: W - M * 2 },
    );
  doc.font(BODY).fontSize(6.5).fillColor(MUTED)
    .text(tracked('reportagepost.com'.toUpperCase(), 1), M, stripY - 26, { width: W - M * 2, align: 'right' });
}

/**
 * Собрать презентацию. Возвращает готовый PDF одним буфером: файл в худшем
 * случае — единицы мегабайт, и потоковая отдача усложнила бы роут ради выгоды,
 * которой нет.
 */
export async function buildPortfolioPdf(
  author: PdfAuthor,
  photos: PdfPhoto[],
  tier: PlanTier,
): Promise<Buffer> {
  const limit = PDF_PHOTO_LIMIT[tier];
  const selected = photos.slice(0, limit);

  const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: true, info: {
    Title: `${author.firstName} ${author.lastName} — портфолио`,
    Author: `${author.firstName} ${author.lastName}`,
    Creator: 'Репортаж Пост',
  } });
  doc.registerFont(DISPLAY, DISPLAY);
  doc.registerFont(BODY, BODY);
  doc.registerFont(BODY_BOLD, BODY_BOLD);

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  await coverPage(doc, author);
  await photoPages(doc, selected, tier === 'FREE');
  await factsAndContacts(doc, author, tier, selected.slice(-3));

  doc.end();
  return done;
}
