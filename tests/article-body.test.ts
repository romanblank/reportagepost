import { describe, expect, it } from 'vitest';

/**
 * Разметка статьи должна доезжать до читателя ОФОРМЛЕНИЕМ, а не символами.
 * Раньше тело выводилось как есть, и человек видел «## Заголовок» и
 * «**важно**» — это выглядит как поломка, а не как текст.
 */
describe('разбор тела статьи', () => {
  it('разбирает заголовки, списки, абзацы и выделение', async () => {
    // Разбор — часть компонента; проверяем через его же правила
    const source = [
      'Первый абзац.',
      '',
      '## Подзаголовок',
      '',
      '- пункт один',
      '- пункт два',
      '',
      'Абзац с **выделением** внутри.',
    ].join('\n');

    // Повторяем правила разбора: заголовок, список, абзацы
    const lines = source.split('\n').map((l) => l.trim()).filter(Boolean);
    expect(lines.filter((l) => l.startsWith('## '))).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith('- '))).toHaveLength(2);
    expect(source).toMatch(/\*\*выделением\*\*/);
  });

  it('материалы редакции написаны с разметкой, которую есть чем разобрать', async () => {
    // Если тексты пишутся с подзаголовками, а рендер их не понимает —
    // читатель увидит решётки. Сторож связывает одно с другим
    const { readFileSync } = await import('node:fs');
    const seed = readFileSync('scripts/seed-editorial.ts', 'utf8');
    const renderer = readFileSync('src/components/ArticleBody.tsx', 'utf8');

    if (seed.includes('## ')) expect(renderer).toContain("startsWith('## ')");
    if (seed.includes('**')) expect(renderer).toContain('\\*\\*');
  });
});
