import { describe, expect, it } from 'vitest';
import { formatRubMinor } from '@/lib/money';
import { normalizePhone, normalizeUrl } from '@/lib/phone-format';
import { slugFromName } from '@/lib/translit';

// Чистые утилиты конверсионных форм — детерминированы, без БД.

describe('money.formatRubMinor — минорные единицы → ₽ (инвариант денег)', () => {
  const norm = (s: string) => s.replace(/\s/g, ''); // убрать narrow/no-break пробелы
  it('делит на 100 и форматирует без копеек', () => {
    expect(norm(formatRubMinor(1_500_000))).toBe('15000₽');
    expect(norm(formatRubMinor(0))).toBe('0₽');
    expect(norm(formatRubMinor(99_00))).toBe('99₽');
  });
  it('крупные суммы группируются, дробь отбрасывается', () => {
    expect(norm(formatRubMinor(123_456_700))).toBe('1234567₽');
    expect(norm(formatRubMinor(150))).toBe('2₽'); // 1.5 ₽ → округление до 0 знаков
  });
});

describe('phone-format.normalizePhone — ввод РФ → E.164', () => {
  it('«+7 (916) 123-45-67» → +79161234567', () => {
    expect(normalizePhone('+7 (916) 123-45-67')).toBe('+79161234567');
  });
  it('«8 916 123 45 67» → +79161234567', () => {
    expect(normalizePhone('8 916 123 45 67')).toBe('+79161234567');
  });
  it('«79161234567» (11 цифр с 7) → +79161234567', () => {
    expect(normalizePhone('79161234567')).toBe('+79161234567');
  });
  it('«9161234567» (10 цифр) → +79161234567', () => {
    expect(normalizePhone('9161234567')).toBe('+79161234567');
  });
  it('пустое/мусор → пусто', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone('нет телефона')).toBe('');
  });
});

describe('phone-format.normalizeUrl — домен → https', () => {
  it('добавляет схему только если её нет', () => {
    expect(normalizeUrl('mysite.ru')).toBe('https://mysite.ru');
    expect(normalizeUrl('https://x.ru')).toBe('https://x.ru');
    expect(normalizeUrl('http://x.ru')).toBe('http://x.ru');
    expect(normalizeUrl('  ')).toBe('');
  });
});

describe('translit.slugFromName — кириллица → username-слаг', () => {
  it('транслитерирует имя+фамилию', () => {
    expect(slugFromName('Пётр', 'Тестовиков')).toBe('petr-testovikov');
    expect(slugFromName('Мария', 'Светова')).toBe('mariya-svetova');
  });
  it('спецсимволы/эмодзи отбрасываются, дефисы схлопываются', () => {
    expect(slugFromName('Анна!!! ✨', 'Ко  ва')).toBe('anna-ko-va');
  });
  it('латиница/цифры проходят, обрезка до 30', () => {
    expect(slugFromName('roman-blank-2026')).toBe('roman-blank-2026');
    expect(slugFromName('оченьдлинноеимяфамилиясверхтридцатисимволов').length).toBeLessThanOrEqual(30);
  });
});
