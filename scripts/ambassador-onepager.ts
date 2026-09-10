import 'dotenv/config';
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

/**
 * Одностраничник амбассадора (GTM-план, оценка 2026-09-10): PDF в фирменном
 * стиле — «что это и зачем твоим коллегам». Амбассадор шлёт его вместе с
 * личным сообщением (шаблон — vault/Проект/demand/ambassador-kit.md).
 * Стиль — как у портфолио-презентации: тёмный грунт, Cormorant + Inter,
 * кириллица встроена (без этого читалка подставит квадраты).
 *
 * Запуск: npx tsx scripts/ambassador-onepager.ts [выходной-путь.pdf]
 */
const FONT_DIR = path.join(process.cwd(), 'src/assets/fonts');
const DISPLAY = path.join(FONT_DIR, 'CormorantGaramond-SemiBold.ttf');
const BODY = path.join(FONT_DIR, 'Inter-Regular.ttf');
const BODY_BOLD = path.join(FONT_DIR, 'Inter-SemiBold.ttf');

// Токены грунта — как в globals.css/portfolio-pdf
const BG = '#0e0f11'; // грунт «Огней площадки» (2026-09-10)
const INK = '#f2f0eb';
const MUTED = '#9a9aa2';
const ACCENT = '#6b97e8'; // электрик — фирменный акцент действия

const W = 595.28; // A4 портрет, pt
const H = 841.89;
const M = 56;

async function main() {
  const out = process.argv[2] ?? '/Users/Blank/Documents/Платформы/docs-vault/Проект/demand/ambassador-onepager.pdf';
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Репортаж Пост — для коллег' } });
  doc.registerFont(DISPLAY, DISPLAY);
  doc.registerFont(BODY, BODY);
  doc.registerFont(BODY_BOLD, BODY_BOLD);
  const stream = createWriteStream(out);
  doc.pipe(stream);

  // Грунт
  doc.rect(0, 0, W, H).fill(BG);

  // Шапка
  doc.font(BODY_BOLD).fontSize(10).fillColor(ACCENT).text('РЕПОРТАЖ ПОСТ', M, M, { characterSpacing: 2 });
  doc.font(DISPLAY).fontSize(34).fillColor(INK).text('Каталог репортажных\nфотографов', M, M + 24, { lineGap: 2 });
  doc.font(BODY).fontSize(11.5).fillColor(MUTED).text(
    'Портфолио сериями, цены, календарь занятости и заявки заказчиков — без свадебных пакетов и «услуг» вперемешку с сантехниками.',
    M, doc.y + 10, { width: W - M * 2, lineGap: 3 },
  );

  // Разделитель
  let y = doc.y + 22;
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.7).strokeColor('#2a2c33').stroke();
  y += 24;

  // Что внутри — факты, не оценки
  const items: [string, string][] = [
    ['Страница за 20–30 минут', 'Импорт кадров по ссылке с вашего сайта или диска. 10–20 кадров одной темы, цены пакетами, техника, занятые даты.'],
    ['Каталог без продажи мест', 'Порядок в выдаче не покупается — подписка его не двигает. Сверху те, чьи работы и отклик заказчиков говорят сами.'],
    ['Заявки — напрямую', 'Заказчик описывает событие, авторы города получают заявку. Контакты, переписка и оплата — напрямую, платформа не берёт комиссию со съёмки.'],
    ['Подтверждённые съёмки', 'Заказчик подтверждает состоявшуюся съёмку — на странице копятся факты «снимали вместе N раз» и отзывы за реальную работу. Прошлых заказчиков можно позвать по ссылке — репутация приезжает с вами.'],
    ['Календарь занятости', 'Отмечаете занятые дни — вас находят под свободную дату. На вопрос «кто свободен 14-го» здесь отвечает каталог, а не обзвон.'],
  ];
  for (const [title, text] of items) {
    doc.font(BODY_BOLD).fontSize(12.5).fillColor(INK).text(title, M, y);
    doc.font(BODY).fontSize(10.5).fillColor(MUTED).text(text, M, doc.y + 3, { width: W - M * 2, lineGap: 2.5 });
    y = doc.y + 16;
  }

  // Условия первым
  y += 6;
  doc.roundedRect(M, y, W - M * 2, 92, 4).fill('#1a1c21');
  doc.font(BODY_BOLD).fontSize(10).fillColor(ACCENT).text('ПЕРВЫМ', M + 18, y + 16, { characterSpacing: 1.5 });
  doc.font(BODY).fontSize(10.5).fillColor(INK).text(
    'Закрытый набор — зовём тех, чьи работы знаем. Первым авторам — девяносто дней подписки бесплатно и цена основателя, закреплённая навсегда, если решите остаться на платном уровне.',
    M + 18, y + 32, { width: W - M * 2 - 36, lineGap: 2.5 },
  );
  y += 92 + 24;

  // Подвал
  doc.font(DISPLAY).fontSize(16).fillColor(INK).text('reportagepost.com', M, y);
  doc.font(BODY).fontSize(9.5).fillColor(MUTED).text(
    'Вход по персональной ссылке-приглашению — она в сообщении рядом с этим файлом.',
    M, doc.y + 6, { width: W - M * 2 },
  );

  doc.end();
  await new Promise<void>((res, rej) => { stream.on('finish', () => res()); stream.on('error', rej); });
  console.log('PDF готов:', out);
}

main().catch((e) => { console.error(e); process.exit(1); });
