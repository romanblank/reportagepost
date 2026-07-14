import { describe, expect, it } from 'vitest';
import { parseFaq } from '@/lib/faq';

describe('parseFaq: защитный разбор', () => {
  it('валидный массив → пары; триммит; пустые отбрасывает', () => {
    expect(parseFaq([{ q: ' Вопрос ', a: ' Ответ ' }, { q: '', a: 'x' }])).toEqual([{ q: 'Вопрос', a: 'Ответ' }]);
  });
  it('не-массив / мусор → []', () => {
    expect(parseFaq(null)).toEqual([]);
    expect(parseFaq('строка')).toEqual([]);
    expect(parseFaq([{ q: 1, a: 2 }, 'мусор', null])).toEqual([]);
  });
  it('ограничивает до 10', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ q: `q${i}`, a: `a${i}` }));
    expect(parseFaq(many)).toHaveLength(10);
  });
});
