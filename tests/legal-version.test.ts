import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDN_CONSENT_VERSION, LEGAL_CONTENT_SHA } from '@/lib/constants';

/**
 * Версия согласия обязана идентифицировать текст, под которым его давали.
 *
 * Так было не всегда: метка `2026-07-15` стояла у всех согласий, пока сами
 * документы правились трижды — в том числе правкой, которой в политике впервые
 * назвали оператора персональных данных. Доказательная ценность такой метки
 * нулевая: непонятно, на что именно соглашался человек.
 *
 * Этот тест делает «поменял текст — забыл версию» невозможным.
 */
describe('юридические документы: версия соответствует тексту', () => {
  it('контрольная сумма текстов совпадает с зафиксированной для текущей версии', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/lib/legal-content.ts'), 'utf8');
    const actual = createHash('sha256').update(src, 'utf8').digest('hex').slice(0, 16);

    expect(
      actual,
      'Текст юридических документов изменился. Подними PDN_CONSENT_VERSION на сегодняшнюю дату ' +
        `и запиши новую сумму в LEGAL_CONTENT_SHA: '${actual}'. ` +
        'Иначе согласия будут ссылаться на редакцию, которой не соответствуют.',
    ).toBe(LEGAL_CONTENT_SHA);
  });

  it('версия выглядит как дата и не из будущего', () => {
    expect(PDN_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(PDN_CONSENT_VERSION).getTime()).toBeLessThanOrEqual(Date.now() + 86_400_000);
  });
});
