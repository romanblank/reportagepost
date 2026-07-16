import { describe, expect, it } from 'vitest';
import {
  priceForCity, cityTierOf, annualSavingPct, foundingPrice, portfolioLimit,
  FREE_PORTFOLIO_LIMIT, PRO_PORTFOLIO_LIMIT, FOUNDING_DISCOUNT_PCT,
} from '@/lib/pricing';

describe('pricing — цены по городам (чистая математика)', () => {
  it('город → тариф A/B/C', () => {
    expect(cityTierOf('moscow')).toBe('A');
    expect(cityTierOf('saint-petersburg')).toBe('A');
    expect(cityTierOf('kazan')).toBe('B');
    expect(cityTierOf('tula')).toBe('C');
    expect(cityTierOf(null)).toBe('C');
  });

  it('цена столиц выше миллионников выше прочих', () => {
    const a = priceForCity('moscow');
    const b = priceForCity('kazan');
    const c = priceForCity('tula');
    expect(a.monthlyMinor).toBe(99_000); // 990 ₽
    expect(b.monthlyMinor).toBe(69_000);
    expect(c.monthlyMinor).toBe(49_000);
    expect(a.monthlyMinor).toBeGreaterThan(b.monthlyMinor);
    expect(b.monthlyMinor).toBeGreaterThan(c.monthlyMinor);
  });

  it('годовая скидка ~17%', () => {
    for (const slug of ['moscow', 'kazan', 'tula']) {
      const p = priceForCity(slug);
      expect(annualSavingPct(p)).toBe(17);
      expect(p.annualMinor).toBe(p.monthlyMinor * 10); // год = 10×месяц
    }
  });

  it('founding-цена = город −30%, кратна 1000 копеек', () => {
    const p = priceForCity('moscow'); // 99000/мес
    const f = foundingPrice(p);
    const expected = Math.round((99_000 * (100 - FOUNDING_DISCOUNT_PCT)) / 100 / 1000) * 1000;
    expect(f.monthlyMinor).toBe(expected);
    expect(f.monthlyMinor).toBeLessThan(p.monthlyMinor);
    expect(f.monthlyMinor % 1000).toBe(0);
  });

  it('лимит портфолио по тарифу', () => {
    expect(portfolioLimit('FREE')).toBe(FREE_PORTFOLIO_LIMIT);
    expect(portfolioLimit('PRO')).toBe(PRO_PORTFOLIO_LIMIT);
    expect(PRO_PORTFOLIO_LIMIT).toBeGreaterThan(FREE_PORTFOLIO_LIMIT);
  });
});
