import { describe, expect, it } from 'vitest';
import { buildSalesDoc, DOC_MIN_TIER, type AuthorContext } from '@/lib/sales-kit';

const author: AuthorContext = {
  firstName: 'Роман',
  lastName: 'Затвор',
  cityName: 'Москва',
  phone: '+79990001122',
  email: 'roman@example.com',
  profileUrl: 'https://reportagepost.com/ru/photographer/roman',
  packages: [{ hours: 4, priceMinor: 2_800_000 }],
  legalName: null,
  inn: null,
  account: null,
  bankName: null,
  bic: null,
};

/**
 * Документы для юрлиц должны работать ПОЛНОСТЬЮ без нас: фотограф скачал и
 * пользуется. Поэтому проверяем не «файл сгенерировался», а что в нём есть
 * его данные, честная оговорка и видимые пропуски вместо тихо пропавших
 * реквизитов.
 */
describe('документы для работы с компаниями', () => {
  it('подставляют данные автора и его цены', () => {
    const doc = buildSalesDoc('proposal', author);
    expect(doc).toContain('Роман');
    expect(doc).toContain('Затвор');
    expect(doc).toContain('Москва');
    expect(doc).toContain('reportagepost.com/ru/photographer/roman');
    // Цена из пакетов, а не «по договорённости»
    expect(doc).toMatch(/4 ч/);
    expect(doc).toMatch(/28\s?000/);
  });

  it('незаполненные реквизиты остаются видимыми пропусками', () => {
    const doc = buildSalesDoc('invoice', author);
    // Пропуск с подсказкой, а не пустое место, которое автор не заметит и
    // отправит в бухгалтерию заказчика
    expect(doc).toContain('(ИНН)');
    expect(doc).toContain('(расчётный счёт)');
  });

  it('подставляют заполненные реквизиты', () => {
    const doc = buildSalesDoc('invoice', {
      ...author,
      legalName: 'ИП Затвор Роман',
      inn: '123456789012',
      account: '40802810000000000001',
      bankName: 'Банк',
      bic: '044525000',
    });
    expect(doc).toContain('ИП Затвор Роман');
    expect(doc).toContain('123456789012');
    expect(doc).not.toContain('(ИНН)');
  });

  it('в каждом документе есть оговорка про отсутствие юридической консультации', () => {
    for (const kind of Object.keys(DOC_MIN_TIER) as (keyof typeof DOC_MIN_TIER)[]) {
      const doc = buildSalesDoc(kind, author);
      expect(doc, `${kind} без оговорки`).toContain('не заменяет юридическую консультацию');
    }
  });

  it('бриф и чек-лист бесплатны — они про качество съёмки, а не про деньги автора', () => {
    expect(DOC_MIN_TIER.brief).toBe('FREE');
    expect(DOC_MIN_TIER.checklist).toBe('FREE');
    // А закрывающие документы — верхний уровень
    expect(DOC_MIN_TIER.invoice).toBe('ELITE');
    expect(DOC_MIN_TIER.act).toBe('ELITE');
  });

  it('чек-лист напоминает отметить съёмку — это замыкает петлю доверия', () => {
    expect(buildSalesDoc('checklist', author)).toContain('отметить съёмку на платформе');
  });
});
