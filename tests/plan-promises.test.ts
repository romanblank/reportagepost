import { describe, expect, it } from 'vitest';
import {
  PLAN_FEATURES, featureInTier,
  FREE_PORTFOLIO_LIMIT, PRIME_PORTFOLIO_LIMIT, ELITE_PORTFOLIO_LIMIT,
  FREE_VIDEO_LIMIT, PRIME_VIDEO_LIMIT,
  ELITE_VIDEO_LIMIT, PAID_VIDEO_SECONDS,
  INQUIRY_HEAD_START_HOURS, PDF_PHOTO_LIMIT, ARTICLE_QUOTA, THREAD_QUOTA,
} from '@/lib/pricing';
import { ru } from '@/i18n/ru';

/**
 * Витрина тарифов — это обещание, которое человек оплачивает.
 *
 * Расхождение между строкой на странице и числом в коде обнаруживает не
 * разработчик, а подписчик: «портфолио без ограничений» упиралось в потолок
 * 300 кадров, а «персональный разбор страницы» обещал человека, которого у
 * платформы нет. Тест сверяет ЧИСЛА из текстов с константами.
 */
function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

/**
 * Числа в текстах написаны словами — так и должно быть в интерфейсе.
 * Поэтому сверяем и цифру, и словесную форму: тест обязан подстраиваться под
 * типографику, а не типографика под тест.
 */
// Границы слова (\b) в JavaScript считаются только по латинице, поэтому для
// кириллицы используем явные границы через (?<![а-яё]) и (?![а-яё]).
const WORDS: Record<number, RegExp> = {
  1: /(?<![а-яё])(один|одну|одного)(?![а-яё])/i,
  2: /(?<![а-яё])(два|две|двух)(?![а-яё])/i,
  3: /(?<![а-яё])(три|трёх|трех)(?![а-яё])/i,
  7: /(?<![а-яё])(семь|семи)(?![а-яё])/i,
  4: /(?<![а-яё])(четыре|четырёх|четырех)(?![а-яё])/i,
  6: /(?<![а-яё])(шесть|шести)(?![а-яё])/i,
  12: /(?<![а-яё])(двенадцать|двенадцати)(?![а-яё])/i,
  20: /(?<![а-яё])(двадцать|двадцати)(?![а-яё])/i,
  40: /(?<![а-яё])(сорок|сорока)(?![а-яё])/i,
  300: /(?<![а-яё])(триста|трёхсот)(?![а-яё])/i,
  1000: /(?<![а-яё])(тысяча|тысячи)(?![а-яё])/i,
};

function mentions(text: string, value: number): boolean {
  if (numbersIn(text).includes(value)) return true;
  const word = WORDS[value];
  return Boolean(word && word.test(text));
}

describe('обещания тарифов совпадают с кодом', () => {
  it('у каждой фичи витрины есть текст', () => {
    for (const f of PLAN_FEATURES) {
      expect(ru.pro.features[f.key], `нет описания фичи «${f.key}»`).toBeTruthy();
    }
  });

  it('лимиты портфолио названы теми же числами, что действуют', () => {
    expect(mentions(ru.pro.features.portfolioBasic, FREE_PORTFOLIO_LIMIT)).toBe(true);
    expect(mentions(ru.pro.features.portfolioUnlimited, PRIME_PORTFOLIO_LIMIT)).toBe(true);
    expect(mentions(ru.pro.features.earlyAccess, ELITE_PORTFOLIO_LIMIT)).toBe(true);
    // Обещания слежки «кто и когда вас смотрит», «откуда приходят заявки» —
    // функциональность, которой нет: аналитика отдаёт агрегаты, а не личности
    // и не атрибуцию (аудит 2026-08-16). Первым расхождение увидел бы
    // оплативший — худшая аудитория для обмана
    const teaser = ru.cabinet.proTeaser(3, 2);
    expect(teaser).not.toMatch(/кто( и когда)? вас смотр/i);
    expect(teaser).not.toMatch(/откуда приходят/i);

    // Слова «без ограничений» запрещены там, где ограничение есть
    expect(ru.pro.features.portfolioUnlimited).not.toMatch(/без ограничений|безлимит/i);
  });

  it('видео: число роликов и длительность соответствуют константам', () => {
    // Решение партнёра 2026-08-18: Free — без видео, Active 3, Active+ 7
    expect(FREE_VIDEO_LIMIT).toBe(0);
    expect('videoBasic' in ru.pro.features).toBe(false); // не обещаем то, чего нет
    expect(mentions(ru.pro.features.videoMore, PRIME_VIDEO_LIMIT)).toBe(true);
    expect(mentions(ru.pro.features.videoMax, ELITE_VIDEO_LIMIT)).toBe(true);
    expect(PRIME_VIDEO_LIMIT).toBe(3);
    expect(ELITE_VIDEO_LIMIT).toBe(7);
    expect(PAID_VIDEO_SECONDS).toBe(90);
  });

  it('фора выключена решением партнёра (2026-08-18) и не продаётся на витрине', () => {
    // Нули = заявка уходит всем одновременно. Если фору вернут константами,
    // этот тест напомнит вернуть и строку витрины (и наоборот)
    expect(INQUIRY_HEAD_START_HOURS.ELITE).toBe(0);
    expect(INQUIRY_HEAD_START_HOURS.PRIME).toBe(0);
    expect('inquiryHeadStart' in ru.pro.features).toBe(false);
  });

  it('квоты и лимиты перков совпадают с числами в текстах', () => {
    expect(mentions(ru.pro.features.presentationPdf, PDF_PHOTO_LIMIT.PRIME)).toBe(true);
    expect(mentions(ru.pro.features.presentationPdfPlus, PDF_PHOTO_LIMIT.ELITE)).toBe(true);
    expect(mentions(ru.pro.features.threads, THREAD_QUOTA.PRIME)).toBe(true);
    expect(ARTICLE_QUOTA.PRIME).toBe(2);
    expect(ARTICLE_QUOTA.ELITE).toBe(6);
  });

  it('витрина не обещает того, что требует человека на нашей стороне', () => {
    // Менеджеров у платформы нет, и продукт, требующий их, работать не будет
    for (const f of PLAN_FEATURES) {
      const text = ru.pro.features[f.key];
      expect(text, `«${f.key}» обещает ручную работу: ${text}`).not.toMatch(
        /персональный (разбор|онбординг|менеджер)|подберём вручную|наш менеджер/i,
      );
    }
  });

  it('порядок уровней не даёт бесплатному то, что продаётся', () => {
    for (const f of PLAN_FEATURES) {
      if (f.minTier === 'FREE') continue;
      expect(featureInTier(f, 'FREE'), `«${f.key}» доступна бесплатному уровню`).toBe(false);
    }
  });
});
