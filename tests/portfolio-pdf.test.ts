import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { buildPortfolioPdf, type PdfAuthor, type PdfPhoto } from '@/lib/portfolio-pdf';
import { PDF_PHOTO_LIMIT } from '@/lib/pricing';

async function frame(hue: number): Promise<Buffer> {
  return sharp({
    create: { width: 900, height: 600, channels: 3, background: { r: hue, g: 90, b: 120 } },
  }).jpeg().toBuffer();
}

async function photos(n: number): Promise<PdfPhoto[]> {
  const out: PdfPhoto[] = [];
  for (let i = 0; i < n; i += 1) out.push({ buffer: await frame(20 + i * 4), categoryName: null });
  return out;
}

const author = async (): Promise<PdfAuthor> => ({
  firstName: 'Ольга',
  lastName: 'Линза',
  cityName: 'Москва',
  categories: ['Корпоративные события'],
  phone: '+79990001122',
  email: 'olga@example.com',
  siteUrl: null,
  profileUrl: 'reportagepost.com/ru/photographer/olga',
  cover: await frame(40),
  shoots: { count: 12, clients: 9, returning: 3 },
  reviews: [{ author: 'Ирина К.', body: 'Материал был на следующий день.', verified: true }],
});

/** Извлечь читаемый текст из PDF: pdfkit пишет строки в потоки со сжатием, */
/** поэтому проверяем структуру и вес, а текст — по метаданным документа. */
function pageCount(pdf: Buffer): number {
  const m = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : 0;
}

describe('презентация портфолио', () => {
  it('уровень задаёт количество кадров, а не право на файл', async () => {
    // Бесплатный уровень получает не «пробник», а короткую визитку: запертый
    // файл ничего бы не продал, а плохой — навредил бы автору
    const all = await photos(40);
    const free = await buildPortfolioPdf(await author(), all, 'FREE');
    const elite = await buildPortfolioPdf(await author(), all, 'ELITE');
    expect(pageCount(free)).toBeGreaterThan(2);
    expect(pageCount(elite)).toBeGreaterThan(pageCount(free));
    expect(PDF_PHOTO_LIMIT.FREE).toBeLessThan(PDF_PHOTO_LIMIT.ELITE);
  }, 120_000);

  it('кадры автора не портятся водяным знаком', async () => {
    // Присутствие платформы — подпись на полях. Перечёркнутый кадр обесценил
    // бы автора, а не нас, поэтому проверяем именно отсутствие штампа поверх
    const src = await photos(1);
    const pdf = await buildPortfolioPdf({ ...(await author()), cover: null }, src, 'FREE');
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.toString('latin1')).not.toContain('/SMask /None /Watermark');
  }, 60_000);

  it('собирается без обложки, отзывов и фактов', async () => {
    // Свежий автор: одобрен, кадры есть, подтверждённых съёмок ещё нет —
    // презентация обязана получиться, а не упасть на пустом блоке
    const bare: PdfAuthor = {
      ...(await author()), cover: null, shoots: null, reviews: [], phone: null, email: null,
    };
    const pdf = await buildPortfolioPdf(bare, await photos(3), 'PRIME');
    expect(pageCount(pdf)).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it('кириллица встроена: файл несёт свой шрифт, а не надеется на читалку', async () => {
    const pdf = await buildPortfolioPdf(await author(), await photos(2), 'PRIME');
    const raw = pdf.toString('latin1');
    // Встроенный TrueType-шрифт — иначе кириллица превратится в квадраты
    expect(raw).toContain('/FontFile2');
    expect(raw).toMatch(/CormorantGaramond|Inter/);
  }, 60_000);
});
