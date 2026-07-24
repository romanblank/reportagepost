import { describe, expect, it } from 'vitest';
import { APP_NAME, DEFAULT_LOCALE } from '@/lib/constants';

describe('smoke', () => {
  it('каркас жив: константы проекта доступны', () => {
    expect(APP_NAME).toBe('Репортаж Пост');
    expect(DEFAULT_LOCALE).toBe('ru');
  });
});
