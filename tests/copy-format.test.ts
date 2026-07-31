import { describe, expect, it } from 'vitest';
import { plural } from '@/i18n/ru';
import { formatDateRu, formatDateTimeRu } from '@/lib/date-format';

// Копирайт-дефекты уровня P0/P1 из аудита 2026-07-31: несклоняемые числительные
// («1 авторов», «3 работ») и ISO-даты в интерфейсе («2026-08-14»).

describe('plural: русские числительные', () => {
  const forms: [string, string, string] = ['работа', 'работы', 'работ'];
  it('склоняет по правилам русского языка, включая 11-14 и десятки', () => {
    expect(plural(1, forms)).toBe('работа');
    expect(plural(2, forms)).toBe('работы');
    expect(plural(4, forms)).toBe('работы');
    expect(plural(5, forms)).toBe('работ');
    expect(plural(11, forms)).toBe('работ'); // не «работа»
    expect(plural(12, forms)).toBe('работ');
    expect(plural(14, forms)).toBe('работ');
    expect(plural(21, forms)).toBe('работа');
    expect(plural(22, forms)).toBe('работы');
    expect(plural(25, forms)).toBe('работ');
    expect(plural(101, forms)).toBe('работа');
    expect(plural(111, forms)).toBe('работ');
    expect(plural(0, forms)).toBe('работ');
  });
});

describe('formatDateRu: человеческая дата', () => {
  it('месяц прописью; год опускается для текущего и остаётся для другого', () => {
    const now = new Date(Date.UTC(2026, 7, 1));
    expect(formatDateRu(new Date(Date.UTC(2026, 7, 14)), now)).toBe('14 августа');
    expect(formatDateRu(new Date(Date.UTC(2027, 0, 3)), now)).toBe('3 января 2027');
    expect(formatDateTimeRu(new Date(Date.UTC(2026, 7, 14, 18, 30)), now)).toBe('14 августа, 18:30');
  });
});
