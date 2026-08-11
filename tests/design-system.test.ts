import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Дизайн-система держится дисциплиной, а не памятью.
 *
 * Разнобой накапливается незаметно: одна страница со своим радиусом, другая с
 * зашитым цветом — по отдельности мелочи, вместе интерфейс перестаёт выглядеть
 * сделанным одним человеком. Это и есть главный признак «машинного» вида, с
 * которым борются: не уродливые экраны, а отсутствие единой руки.
 *
 * Правила — в DESIGN.md.
 */
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.tsx')) out.push(full);
    }
  };
  walk(path.join(process.cwd(), 'src/app'));
  walk(path.join(process.cwd(), 'src/components'));
  return out;
}

describe('дизайн-система: единый визуальный язык', () => {
  it('радиусы — только из набора токенов', () => {
    // rounded-lg/xl/2xl появлялись стихийно и ломали ритм скруглений
    const banned = /\brounded-(lg|xl|2xl|3xl)\b/;
    const offenders = sources()
      .filter((f) => banned.test(readFileSync(f, 'utf8')))
      .map((f) => f.split('/src/')[1]);

    expect(
      offenders,
      `нетокенные радиусы (см. DESIGN.md):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('цвета берутся из токенов, а не пишутся кодом в разметке', () => {
    // Исключение — фирменный цвет чужого сервиса на кнопке входа: он не наш и
    // в наши токены не входит
    const allowed = new Set(['#fc3f1d']);
    const offenders: string[] = [];

    for (const f of sources()) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\[#([0-9a-fA-F]{3,8})\]/g)) {
        const hex = `#${m[1].toLowerCase()}`;
        if (!allowed.has(hex)) offenders.push(`${f.split('/src/')[1]}: ${hex}`);
      }
    }

    expect(offenders, `цвета мимо токенов:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('в интерфейсе нет эмодзи вместо иконок', () => {
    // Цветные эмодзи рисуются по-разному на каждой платформе и ломают единый
    // стиль. Типографические знаки (★, ✓, ♥) — не эмодзи: они наследуют цвет
    // и кегль текста, поэтому остаются частью системы
    const emoji = /[\u{1F300}-\u{1FAFF}]/u;
    const offenders = sources()
      .filter((f) => emoji.test(readFileSync(f, 'utf8')))
      .map((f) => f.split('/src/')[1]);

    expect(offenders, `эмодзи в интерфейсе:\n${offenders.join('\n')}`).toEqual([]);
  });

});
